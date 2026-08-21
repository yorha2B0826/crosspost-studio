import type { BrowserPlatformId } from "@crosspost/protocol";

export type BrowserPlatform = BrowserPlatformId;

export interface ExtensionConfiguration {
  pairingKey?: string;
  port: number;
}

export interface ExtensionStatus {
  connected: boolean;
  message: string;
  updatedAt: string;
}

export interface ExtensionConfigurationState {
  configured: boolean;
  port: number;
}

export interface ApplyDraftPayload {
  html: string;
  jobId: string;
  markdown: string;
  platform: BrowserPlatform;
  title: string;
}

export interface ApplyDraftMessage {
  payload: ApplyDraftPayload;
  type: "crosspost:apply-draft";
}

export interface ContentPingMessage {
  type: "crosspost:ping";
}

export interface ContentPingResponse {
  ready: true;
  runtimeRevision: string;
}

export interface SetCsdnMarkdownRequest {
  markdown: string;
  type: "crosspost:set-csdn-markdown";
}

export interface SetCsdnMarkdownResponse {
  applied: boolean;
  markdown?: string;
  message?: string;
}

export interface SetJuejinMarkdownRequest {
  markdown: string;
  type: "crosspost:set-juejin-markdown";
}

export interface SetJuejinMarkdownResponse {
  applied: boolean;
  markdown?: string;
  message?: string;
}

export interface SetZhihuRichTextRequest {
  html: string;
  type: "crosspost:set-zhihu-rich-text";
}

export interface SetZhihuRichTextResponse {
  applied: boolean;
  bodyText?: string;
  message?: string;
}

export interface SetSegmentFaultMarkdownRequest {
  markdown: string;
  type: "crosspost:set-segmentfault-markdown";
}

export interface SetSegmentFaultMarkdownResponse {
  applied: boolean;
  markdown?: string;
  message?: string;
}

export interface UploadBilibiliImageRequest {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  token: string;
  type: "crosspost:upload-bilibili-image";
}

export interface UploadBilibiliImageResponse {
  message?: string;
  uploaded: boolean;
  url?: string;
}

export interface ApplyDraftResult {
  bodyText?: string;
  draftUrl?: string;
  errorCode?: string;
  imageCount?: number;
  message: string;
  saved: boolean;
  unknown?: boolean;
}

export type PopupRequest =
  | { type: "crosspost:get-status" }
  | { config: ExtensionConfiguration; type: "crosspost:save-config" }
  | { type: "crosspost:reconnect" };

export interface PopupResponse {
  configuration?: ExtensionConfigurationState;
  error?: string;
  granted?: boolean;
  status?: ExtensionStatus;
}
