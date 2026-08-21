import { PROTOCOL_VERSION, type BridgeMessage } from "@crosspost/protocol";
import { browser } from "wxt/browser";
import { IdempotencyLedger, type ClaimResult } from "../lib/idempotency";

export type JobResultMessage = Extract<BridgeMessage, { type: "job-result" }>;

export const JOB_LEDGER_STORAGE_KEY = "crosspostJobLedger";

const MAX_COMPLETED_RESULTS = 100;

interface PersistedResult {
  completedAt: string;
  result: JobResultMessage;
}

/**
 * Metadata-only snapshot persisted to browser.storage.local. Article bodies
 * and asset bytes are never written here.
 */
interface PersistedJobLedger {
  active?: string[];
  cancelled?: string[];
  completed?: PersistedResult[];
}

function parsePersisted(raw: unknown): Required<PersistedJobLedger> {
  const persisted: Required<PersistedJobLedger> = {
    active: [],
    cancelled: [],
    completed: []
  };
  // Written only by this module; defensively filter each array anyway.
  if (typeof raw !== "object" || raw === null) {
    return persisted;
  }
  const stored = raw as PersistedJobLedger;
  for (const id of Array.isArray(stored.active) ? stored.active : []) {
    if (typeof id === "string") {
      persisted.active.push(id);
    }
  }
  for (const id of Array.isArray(stored.cancelled) ? stored.cancelled : []) {
    if (typeof id === "string") {
      persisted.cancelled.push(id);
    }
  }
  for (const entry of Array.isArray(stored.completed) ? stored.completed : []) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof entry.completedAt === "string" &&
      typeof entry.result === "object" &&
      entry.result !== null &&
      typeof entry.result.jobId === "string" &&
      typeof entry.result.state === "string" &&
      typeof entry.result.message === "string"
    ) {
      persisted.completed.push({
        completedAt: entry.completedAt,
        result: entry.result
      });
    }
  }
  return persisted;
}

/**
 * Idempotency ledger that survives service-worker restarts. Terminal results
 * (metadata only) and the cancelled set are persisted to storage.local; the
 * in-flight set is persisted too so that ids whose service worker died
 * mid-job can be answered with an explicit unknown instead of re-running.
 */
export class PersistentJobLedger {
  private readonly completed = new IdempotencyLedger<JobResultMessage>(
    MAX_COMPLETED_RESULTS
  );
  private readonly active = new Set<string>();
  private readonly cancelled = new Set<string>();
  private hydration: Promise<void> | undefined;

  /** Restore terminal state recorded by previous service-worker runs. */
  hydrate(): Promise<void> {
    this.hydration ??= this.restore();
    return this.hydration;
  }

  private async restore(): Promise<void> {
    try {
      const stored = await browser.storage.local.get(JOB_LEDGER_STORAGE_KEY);
      const persisted = parsePersisted(stored[JOB_LEDGER_STORAGE_KEY]);
      for (const { result } of persisted.completed) {
        this.completed.complete(result.jobId, result);
        this.active.delete(result.jobId);
      }
      for (const id of persisted.cancelled) {
        this.cancelled.add(id);
      }
      // Ids still marked in-flight when the worker died have an unknown
      // outcome: record an explicit interrupted result instead of re-running.
      for (const id of persisted.active) {
        if (this.completed.claim(id).status !== "new") {
          continue;
        }
        this.completed.complete(id, {
          errorCode: "job-interrupted",
          jobId: id,
          message:
            "The extension service worker restarted while this job was running, so its outcome is unknown. Open the platform manually to check whether a draft was created.",
          protocolVersion: PROTOCOL_VERSION,
          state: "unknown",
          type: "job-result"
        });
      }
      this.active.clear();
      await this.persist();
    } catch (error) {
      console.warn("Failed to restore the job ledger from storage.", error);
    }
  }

  async claim(id: string): Promise<ClaimResult<JobResultMessage>> {
    await this.hydrate();
    const claim = this.completed.claim(id);
    if (claim.status === "new") {
      this.active.add(id);
      await this.persist();
    }
    return claim;
  }

  /** Persist the terminal result before it is delivered to the bridge. */
  async complete(id: string, result: JobResultMessage): Promise<void> {
    this.active.delete(id);
    this.cancelled.delete(id);
    this.completed.complete(id, result);
    await this.persist();
  }

  async release(id: string): Promise<void> {
    if (this.active.delete(id)) {
      await this.persist();
    }
  }

  isCancelled(id: string): boolean {
    return this.cancelled.has(id);
  }

  async markCancelled(id: string): Promise<void> {
    const added = !this.cancelled.has(id);
    this.cancelled.add(id);
    if (added) {
      await this.persist();
    }
  }

  /** Consume a cancellation marker once it has been acted on. */
  async clearCancelled(id: string): Promise<boolean> {
    const removed = this.cancelled.delete(id);
    if (removed) {
      await this.persist();
    }
    return removed;
  }

  private persist(): Promise<void> {
    const snapshot: PersistedJobLedger = {
      active: [...this.active],
      cancelled: [...this.cancelled],
      completed: this.completed.completedValues().map((result) => ({
        completedAt: new Date().toISOString(),
        result
      }))
    };
    return browser.storage.local
      .set({ [JOB_LEDGER_STORAGE_KEY]: snapshot })
      .catch((error: unknown) => {
        console.warn("Failed to persist the job ledger.", error);
      });
  }
}
