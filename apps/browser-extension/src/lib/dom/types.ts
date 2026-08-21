export interface PlatformDomDefinition {
  blurAfterInsert?: boolean;
  contentMode: "adaptive" | "markdown" | "rich-html";
  deferSaveEvidenceToReload?: boolean;
  editorReadyTimeoutMs?: number;
  editorSelectors: string[];
  imageStrategy: "adaptive" | "markdown-paste" | "rich-paste";
  markdownImageDialog?: MarkdownImageDialogDefinition;
  nativeRichImageUpload?: boolean;
  postInsertSettleMs?: number;
  preferDirectDomInsert?: boolean;
  replaceExistingRichContentByPaste?: boolean;
  requireSaveEvidenceAfterAction?: boolean;
  richImageDropFallback?: boolean;
  rewriteMarkdownAfterDialogUploads?: boolean;
  saveActionText?: string | string[];
  saveEvidenceSelectors: string[];
  saveEvidenceText: RegExp;
  skipFinalRichTextReadback?: boolean;
  titleSelectors: string[];
}

export interface MarkdownImageDialogDefinition {
  closeSelectors: string[];
  confirmText?: string;
  dialogSelectors: string[];
  inputSelectors: string[];
  retryCount?: number;
  retryDelayMs?: number;
  triggerSelectors: string[];
  uploadPacingMs?: number;
  uploadTimeoutMs?: number;
}

export interface EmbeddedImage {
  alt?: string;
  file: File;
  token: string;
}

export interface DomAdapterRuntime {
  setCsdnMarkdown?: (markdown: string) => Promise<string | undefined>;
  setSegmentFaultMarkdown?: (markdown: string) => Promise<string | undefined>;
  uploadBilibiliImage?: (file: File, token: string) => Promise<string | undefined>;
}

export class InvalidInlineImageError extends Error {}
