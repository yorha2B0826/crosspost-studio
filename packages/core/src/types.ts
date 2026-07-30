import type {
  AssetDescriptor,
  Diagnostic,
  DraftBinding,
  PlatformId,
  PublicationArtifact
} from "@crosspost/protocol";

export interface ResolvedAsset {
  alt?: string;
  bytes: Uint8Array;
  height?: number;
  mimeType: string;
  name: string;
  width?: number;
}

export interface PublicationAsset extends AssetDescriptor {
  bytes: Uint8Array;
}

export interface RenderMetadata {
  author?: string;
  cover?: string;
  summary?: string;
  tags?: string[];
  title: string;
}

export interface FormulaRasterizerResult {
  bytes: Uint8Array;
  height: number;
  mimeType: "image/png";
  width: number;
}

export type MermaidRenderer = (source: string) => Promise<ResolvedAsset>;

export interface RenderOptions {
  customCss?: string;
  metadata: RenderMetadata;
  platform: PlatformId;
  rasterizeFormula?: (svg: string, display: boolean) => Promise<FormulaRasterizerResult>;
  renderMermaid?: MermaidRenderer;
  resolveAsset?: (source: string) => Promise<ResolvedAsset | undefined>;
  theme: ThemeId;
}

export interface RenderedPublication {
  artifact: PublicationArtifact;
  assets: Map<string, PublicationAsset>;
}

export type ThemeId = "minimal" | "academic" | "tech";

export interface PreflightContext {
  artifact: PublicationArtifact;
  binding?: DraftBinding;
}

export interface DraftContext extends PreflightContext {
  assets: ReadonlyMap<string, PublicationAsset>;
}

export interface PlatformAdapter {
  id: PlatformId;
  preflight(context: PreflightContext): Promise<Diagnostic[]>;
  render(markdown: string, options: Omit<RenderOptions, "platform">): Promise<RenderedPublication>;
  saveDraft(context: DraftContext): Promise<DraftBinding>;
  updateDraft(context: DraftContext & { binding: DraftBinding }): Promise<DraftBinding>;
}
