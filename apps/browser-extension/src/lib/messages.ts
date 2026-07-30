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

export interface ApplyDraftResult {
  draftUrl?: string;
  errorCode?: string;
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
