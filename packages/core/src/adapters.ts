import type { Diagnostic, DraftBinding, PlatformId } from "@crosspost/protocol";

import { renderPublication } from "./renderer.js";
import type {
  DraftContext,
  PlatformAdapter,
  PreflightContext,
  RenderOptions,
  RenderedPublication
} from "./types.js";

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract readonly id: PlatformId;

  preflight(context: PreflightContext): Promise<Diagnostic[]> {
    return Promise.resolve(context.artifact.diagnostics);
  }

  render(
    markdown: string,
    options: Omit<RenderOptions, "platform">
  ): Promise<RenderedPublication> {
    return renderPublication(markdown, {
      ...options,
      platform: this.id
    });
  }

  abstract saveDraft(context: DraftContext): Promise<DraftBinding>;

  abstract updateDraft(
    context: DraftContext & { binding: DraftBinding }
  ): Promise<DraftBinding>;
}
