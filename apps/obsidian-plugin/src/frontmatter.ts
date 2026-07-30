import {
  draftBindingSchema,
  PLATFORM_IDS,
  platformSchema
} from "@crosspost/protocol";
import type { DraftBinding, PlatformId } from "@crosspost/protocol";
import type { App, TFile } from "obsidian";

export interface CrosspostMetadata {
  author?: string;
  bindings: Partial<Record<PlatformId, DraftBinding>>;
  cover?: string;
  summary?: string;
  tags: string[];
  targets: PlatformId[];
  title: string;
}

interface RawCrosspost {
  author?: unknown;
  bindings?: unknown;
  cover?: unknown;
  summary?: unknown;
  tags?: unknown;
  targets?: unknown;
  title?: unknown;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTargets(value: unknown): PlatformId[] {
  if (!Array.isArray(value)) {
    return ["wechat", "zhihu", "juejin"];
  }
  return value.flatMap((item) => {
    const parsed = platformSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function getUnknown(value: object, key: PropertyKey): unknown {
  return Reflect.get(value, key) as unknown;
}

function parseBindings(value: unknown): Partial<Record<PlatformId, DraftBinding>> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const bindings: Partial<Record<PlatformId, DraftBinding>> = {};
  for (const platform of PLATFORM_IDS) {
    const candidate = getUnknown(value, platform);
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const parsed = draftBindingSchema.safeParse({
      draftId: getUnknown(candidate, "draftId"),
      draftUrl: getUnknown(candidate, "draftUrl"),
      platform,
      sourceHash: getUnknown(candidate, "sourceHash"),
      updatedAt: getUnknown(candidate, "updatedAt")
    });
    if (parsed.success) {
      bindings[platform] = parsed.data;
    }
  }
  return bindings;
}

function readRawCrosspost(value: unknown): RawCrosspost {
  if (!value || typeof value !== "object") {
    return {};
  }
  return {
    author: Reflect.get(value, "author"),
    bindings: Reflect.get(value, "bindings"),
    cover: Reflect.get(value, "cover"),
    summary: Reflect.get(value, "summary"),
    tags: Reflect.get(value, "tags"),
    targets: Reflect.get(value, "targets"),
    title: Reflect.get(value, "title")
  };
}

export function readCrosspostMetadata(
  file: TFile,
  frontmatter?: unknown
): CrosspostMetadata {
  const raw = readRawCrosspost(
    frontmatter && typeof frontmatter === "object"
      ? getUnknown(frontmatter, "crosspost")
      : undefined
  );
  return {
    author: stringValue(raw.author),
    bindings: parseBindings(raw.bindings),
    cover: stringValue(raw.cover),
    summary: stringValue(raw.summary),
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    targets: parseTargets(raw.targets),
    title: stringValue(raw.title) ?? file.basename
  };
}

export async function writeDraftBinding(
  app: App,
  file: TFile,
  binding: DraftBinding
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    mergeDraftBinding(frontmatter, binding);
  });
}

export function mergeDraftBinding(
  frontmatter: unknown,
  binding: DraftBinding
): void {
  if (!frontmatter || typeof frontmatter !== "object") {
    throw new TypeError("Frontmatter must be an object.");
  }
  const record = frontmatter as Record<string, unknown>;
  const existing =
    record.crosspost && typeof record.crosspost === "object"
      ? (record.crosspost as Record<string, unknown>)
      : {};
  const bindings =
    existing.bindings && typeof existing.bindings === "object"
      ? (existing.bindings as Record<string, unknown>)
      : {};
  record.crosspost = {
    ...existing,
    bindings: {
      ...bindings,
      [binding.platform]: {
        ...(binding.draftId ? { draftId: binding.draftId } : {}),
        ...(binding.draftUrl ? { draftUrl: binding.draftUrl } : {}),
        sourceHash: binding.sourceHash,
        updatedAt: binding.updatedAt
      }
    }
  };
}
