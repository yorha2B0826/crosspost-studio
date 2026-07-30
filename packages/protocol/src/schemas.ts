import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const MAX_BRIDGE_MESSAGE_BYTES = 512 * 1024;

export const PLATFORM_IDS = [
  "wechat",
  "zhihu",
  "juejin",
  "csdn",
  "oschina",
  "cnblogs"
] as const;
export const BROWSER_PLATFORM_IDS = [
  "zhihu",
  "juejin",
  "csdn",
  "oschina",
  "cnblogs"
] as const;

export const platformSchema = z.enum(PLATFORM_IDS);
export type PlatformId = z.infer<typeof platformSchema>;
export const browserPlatformSchema = z.enum(BROWSER_PLATFORM_IDS);
export type BrowserPlatformId = z.infer<typeof browserPlatformSchema>;

export const severitySchema = z.enum(["info", "warning", "error"]);
export type DiagnosticSeverity = z.infer<typeof severitySchema>;

export const diagnosticSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(1_000),
  severity: severitySchema,
  source: z.string().max(500).optional()
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;

export const assetDescriptorSchema = z.object({
  alt: z.string().max(2_000),
  height: z.number().positive().optional(),
  id: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum([
    "formula-inline",
    "formula-block",
    "diagram",
    "image",
    "cover"
  ]),
  mimeType: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  width: z.number().positive().optional()
});
export type AssetDescriptor = z.infer<typeof assetDescriptorSchema>;

export const publicationArtifactSchema = z.object({
  assets: z.array(assetDescriptorSchema),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  diagnostics: z.array(diagnosticSchema),
  html: z.string(),
  markdown: z.string(),
  metadata: z.object({
    author: z.string().max(100).optional(),
    coverAssetId: z.string().optional(),
    summary: z.string().max(2_000).optional(),
    tags: z.array(z.string().max(100)).default([]),
    title: z.string().min(1).max(200)
  }),
  platform: platformSchema
});
export type PublicationArtifact = z.infer<typeof publicationArtifactSchema>;

export const draftBindingSchema = z.object({
  draftId: z.string().max(500).optional(),
  draftUrl: z.string().url().max(2_000).optional(),
  platform: platformSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string().datetime()
});
export type DraftBinding = z.infer<typeof draftBindingSchema>;

export const publishJobSchema = z.object({
  artifact: publicationArtifactSchema,
  assetBaseUrl: z.string().url(),
  assetToken: z.string().min(32).max(256),
  createdAt: z.string().datetime(),
  existingBinding: draftBindingSchema.optional(),
  id: z.string().uuid(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  target: browserPlatformSchema
});
export type PublishJob = z.infer<typeof publishJobSchema>;

export const jobStateSchema = z.enum([
  "queued",
  "prepared",
  "waiting-for-login",
  "injecting",
  "draft-saved",
  "failed",
  "unknown",
  "cancelled"
]);
export type JobState = z.infer<typeof jobStateSchema>;

export const pairChallengeSchema = z.object({
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal("pair")
});

export const pairResponseSchema = z.object({
  proof: z.string().regex(/^[a-f0-9]{64}$/),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal("pair-response")
});

export const pairResultSchema = z.object({
  accepted: z.boolean(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  reason: z.string().max(500).optional(),
  type: z.literal("pair-result")
});

export const capabilitiesSchema = z.object({
  extensionVersion: z.string().min(1).max(50),
  platforms: z.array(browserPlatformSchema),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal("capabilities")
});

export const enqueueJobSchema = z.object({
  job: publishJobSchema,
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal("enqueue-job")
});

export const jobProgressSchema = z.object({
  jobId: z.string().uuid(),
  message: z.string().max(1_000),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  state: jobStateSchema,
  type: z.literal("job-progress")
});

export const jobResultSchema = z.object({
  binding: draftBindingSchema.optional(),
  errorCode: z.string().max(100).optional(),
  jobId: z.string().uuid(),
  message: z.string().max(2_000),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  state: z.enum(["draft-saved", "failed", "unknown", "cancelled"]),
  type: z.literal("job-result")
});

export const cancelJobSchema = z.object({
  jobId: z.string().uuid(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.literal("cancel-job")
});

export const bridgeMessageSchema = z.discriminatedUnion("type", [
  pairChallengeSchema,
  pairResponseSchema,
  pairResultSchema,
  capabilitiesSchema,
  enqueueJobSchema,
  jobProgressSchema,
  jobResultSchema,
  cancelJobSchema
]);
export type BridgeMessage = z.infer<typeof bridgeMessageSchema>;

export function parseBridgeMessage(raw: string): BridgeMessage {
  if (new TextEncoder().encode(raw).byteLength > MAX_BRIDGE_MESSAGE_BYTES) {
    throw new Error("Bridge message exceeds the maximum size.");
  }
  return bridgeMessageSchema.parse(JSON.parse(raw) as unknown);
}
