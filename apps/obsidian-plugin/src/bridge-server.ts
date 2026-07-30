import type { PublicationAsset } from "@crosspost/core";
import {
  generateSecretHex,
  MAX_BRIDGE_MESSAGE_BYTES,
  parseBridgeMessage,
  PROTOCOL_VERSION,
  verifyHmacSha256Hex
} from "@crosspost/protocol";
import type {
  BridgeMessage,
  DraftBinding,
  JobState,
  PlatformId,
  PublicationArtifact,
  PublishJob
} from "@crosspost/protocol";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";

function rawDataToString(raw: RawData): string {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }
  return Buffer.from(raw).toString("utf8");
}

interface StoredJob {
  assets: ReadonlyMap<string, PublicationAsset>;
  expiresAt: number;
  token: string;
}

interface PendingJob {
  client: WebSocket;
  reject: (reason: Error) => void;
  resolve: (binding: DraftBinding) => void;
  timeout: number;
}

export interface BridgeProgress {
  jobId: string;
  message: string;
  state: JobState;
}

export interface BridgeEnqueueInput {
  artifact: PublicationArtifact;
  assets: ReadonlyMap<string, PublicationAsset>;
  binding?: DraftBinding;
  target: Exclude<PlatformId, "wechat">;
}

export class UnknownBridgeDraftStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownBridgeDraftStateError";
  }
}

export class BridgeServer {
  private readonly clients = new Set<WebSocket>();
  private readonly jobs = new Map<string, StoredJob>();
  private readonly pending = new Map<string, PendingJob>();
  private readonly server: Server;
  private readonly webSockets: WebSocketServer;

  constructor(
    private readonly port: number,
    private readonly pairingSecret: string,
    private readonly onProgress: (progress: BridgeProgress) => void
  ) {
    this.server = createServer((request, response) => {
      this.handleHttp(request, response);
    });
    this.webSockets = new WebSocketServer({
      maxPayload: 512 * 1024,
      noServer: true
    });
    this.server.on("upgrade", (request, socket, head) => {
      const origin = request.headers.origin ?? "";
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${this.port}`);
      if (
        url.pathname !== "/v1/bridge" ||
        (!origin.startsWith("chrome-extension://") && !origin.startsWith("moz-extension://"))
      ) {
        socket.destroy();
        return;
      }
      this.webSockets.handleUpgrade(request, socket, head, (client) => {
        this.webSockets.emit("connection", client, request);
      });
    });
    this.webSockets.on("connection", (client) => {
      this.authenticate(client);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, "127.0.0.1");
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close(1_001, "Obsidian plugin stopped");
    }
    this.clients.clear();
    for (const [jobId, pending] of this.pending) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(`Bridge stopped before job ${jobId} completed.`));
    }
    this.pending.clear();
    await new Promise<void>((resolve) => {
      this.webSockets.close(() => {
        this.server.close(() => resolve());
      });
    });
  }

  hasAuthenticatedClient(): boolean {
    return Array.from(this.clients).some((client) => client.readyState === WebSocket.OPEN);
  }

  getBoundPort(): number {
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("The bridge server is not listening.");
    }
    return address.port;
  }

  enqueue(input: BridgeEnqueueInput): Promise<DraftBinding> {
    const client = Array.from(this.clients).find(
      (candidate) => candidate.readyState === WebSocket.OPEN
    );
    if (!client) {
      return Promise.reject(
        new Error("The Crosspost Studio browser extension is not connected.")
      );
    }

    const jobId = randomUUID();
    const token = generateSecretHex();
    this.jobs.set(jobId, {
      assets: input.assets,
      expiresAt: Date.now() + 10 * 60_000,
      token
    });
    const job: PublishJob = {
      artifact: input.artifact,
      assetBaseUrl: `http://127.0.0.1:${this.getBoundPort()}/v1/jobs/${jobId}/assets`,
      assetToken: token,
      createdAt: new Date().toISOString(),
      existingBinding: input.binding,
      id: jobId,
      protocolVersion: PROTOCOL_VERSION,
      target: input.target
    };
    const message: BridgeMessage = {
      job,
      protocolVersion: PROTOCOL_VERSION,
      type: "enqueue-job"
    };
    const serialized = JSON.stringify(message);
    if (Buffer.byteLength(serialized, "utf8") > MAX_BRIDGE_MESSAGE_BYTES) {
      this.jobs.delete(jobId);
      return Promise.reject(
        new Error("The rendered article exceeds the 512 KiB bridge message limit.")
      );
    }

    return new Promise<DraftBinding>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(jobId);
        this.jobs.delete(jobId);
        this.onProgress({
          jobId,
          message: "The browser extension did not confirm the draft result.",
          state: "unknown"
        });
        reject(
          new UnknownBridgeDraftStateError(
            "Browser draft status is unknown after the bridge timeout."
          )
        );
      }, 5 * 60_000);
      this.pending.set(jobId, {
        client,
        reject,
        resolve,
        timeout
      });
      client.send(serialized, (error) => {
        if (error) {
          window.clearTimeout(timeout);
          this.pending.delete(jobId);
          this.jobs.delete(jobId);
          reject(error);
        }
      });
      this.onProgress({
        jobId,
        message: `${input.target} job sent to the browser extension.`,
        state: "queued"
      });
    });
  }

  private authenticate(client: WebSocket): void {
    const nonce = generateSecretHex();
    client.send(
      JSON.stringify({
        nonce,
        protocolVersion: PROTOCOL_VERSION,
        type: "pair"
      } satisfies BridgeMessage)
    );

    const authenticationTimer = window.setTimeout(() => {
      client.close(4_001, "Pairing timed out");
    }, 10_000);

    const handleAuthenticationMessage = async (raw: RawData): Promise<void> => {
      try {
        const message = parseBridgeMessage(rawDataToString(raw));
        if (message.type !== "pair-response") {
          throw new Error("Expected a pairing response.");
        }
        const valid = await verifyHmacSha256Hex(this.pairingSecret, nonce, message.proof);
        client.send(
          JSON.stringify({
            accepted: valid,
            protocolVersion: PROTOCOL_VERSION,
            reason: valid ? undefined : "Pairing proof was invalid.",
            type: "pair-result"
          } satisfies BridgeMessage)
        );
        if (!valid) {
          client.close(4_003, "Pairing rejected");
          return;
        }
        window.clearTimeout(authenticationTimer);
        client.off("message", onAuthenticationMessage);
        this.clients.add(client);
        client.on("message", (messageRaw) => {
          this.handleClientMessage(rawDataToString(messageRaw));
        });
        client.on("close", () => {
          this.clients.delete(client);
          this.failPendingJobsForClient(client);
        });
      } catch {
        client.close(4_002, "Invalid pairing message");
      }
    };
    const onAuthenticationMessage = (raw: RawData): void => {
      void handleAuthenticationMessage(raw);
    };
    client.on("message", onAuthenticationMessage);
  }

  private failPendingJobsForClient(client: WebSocket): void {
    for (const [jobId, pending] of this.pending) {
      if (pending.client !== client) {
        continue;
      }
      window.clearTimeout(pending.timeout);
      this.pending.delete(jobId);
      this.jobs.delete(jobId);
      const message =
        "The browser extension disconnected before confirming the draft result.";
      pending.reject(new UnknownBridgeDraftStateError(message));
      this.onProgress({
        jobId,
        message,
        state: "unknown"
      });
    }
  }

  private handleClientMessage(raw: string): void {
    let message: BridgeMessage;
    try {
      message = parseBridgeMessage(raw);
    } catch {
      return;
    }
    if (message.type === "job-progress") {
      this.onProgress({
        jobId: message.jobId,
        message: message.message,
        state: message.state
      });
      return;
    }
    if (message.type !== "job-result") {
      return;
    }
    const pending = this.pending.get(message.jobId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeout);
    this.pending.delete(message.jobId);
    this.jobs.delete(message.jobId);
    this.onProgress({
      jobId: message.jobId,
      message: message.message,
      state: message.state
    });
    if (message.state === "draft-saved" && message.binding) {
      pending.resolve(message.binding);
    } else {
      const reason = `${message.errorCode ? `${message.errorCode}: ` : ""}${message.message}`;
      pending.reject(
        message.state === "unknown"
          ? new UnknownBridgeDraftStateError(reason)
          : new Error(reason)
      );
    }
  }

  private handleHttp(request: IncomingMessage, response: ServerResponse): void {
    if (request.method === "GET" && request.url === "/health") {
      this.writeJson(response, 200, {
        protocolVersion: PROTOCOL_VERSION,
        status: "ok"
      });
      return;
    }

    const url = new URL(request.url ?? "/", `http://127.0.0.1:${this.port}`);
    const match = url.pathname.match(/^\/v1\/jobs\/([a-f0-9-]+)\/assets\/([a-f0-9]{64})$/);
    if (request.method !== "GET" || !match?.[1] || !match[2]) {
      this.writeJson(response, 404, { error: "not-found" });
      return;
    }
    const [jobId, assetId] = [match[1], match[2]];
    const stored = this.jobs.get(jobId);
    const authorization = request.headers.authorization;
    if (
      !stored ||
      stored.expiresAt < Date.now() ||
      authorization !== `Bearer ${stored.token}`
    ) {
      this.writeJson(response, 401, { error: "unauthorized" });
      return;
    }
    const asset = stored.assets.get(assetId);
    if (!asset) {
      this.writeJson(response, 404, { error: "asset-not-found" });
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": asset.bytes.byteLength,
      "Content-Type": asset.mimeType,
      "X-Content-Type-Options": "nosniff"
    });
    response.end(Buffer.from(asset.bytes));
  }

  private writeJson(
    response: ServerResponse,
    status: number,
    value: Record<string, unknown>
  ): void {
    const body = JSON.stringify(value);
    response.writeHead(status, {
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  }
}
