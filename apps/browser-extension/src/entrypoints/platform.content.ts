import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { applyDraftToVisibleEditor } from "../lib/dom-adapter";
import type {
  ApplyDraftMessage,
  ApplyDraftResult,
  ContentPingMessage,
  SetCsdnMarkdownResponse,
  UploadBilibiliImageResponse
} from "../lib/messages";

function isSetCsdnMarkdownResponse(
  value: unknown
): value is SetCsdnMarkdownResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "applied" in value &&
    typeof value.applied === "boolean" &&
    (!("markdown" in value) ||
      value.markdown === undefined ||
      typeof value.markdown === "string") &&
    (!("message" in value) ||
      value.message === undefined ||
      typeof value.message === "string")
  );
}

function isUploadBilibiliImageResponse(
  value: unknown
): value is UploadBilibiliImageResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "uploaded" in value &&
    typeof value.uploaded === "boolean" &&
    (!("url" in value) ||
      value.url === undefined ||
      typeof value.url === "string") &&
    (!("message" in value) ||
      value.message === undefined ||
      typeof value.message === "string")
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    );
  }
  return `data:${file.type || "application/octet-stream"};base64,${btoa(
    chunks.join("")
  )}`;
}

export default defineContentScript({
  noScriptStartedPostMessage: true,
  registration: "runtime",
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener(
      (
        message: ApplyDraftMessage | ContentPingMessage,
        _sender,
        sendResponse
      ): boolean | undefined => {
        if (message.type === "crosspost:ping") {
          sendResponse({ ready: true });
          return false;
        }
        if (message.type !== "crosspost:apply-draft") {
          return undefined;
        }
        void applyDraftToVisibleEditor(message.payload, {
          setCsdnMarkdown: async (markdown) => {
            const response: unknown = await browser.runtime.sendMessage({
              markdown,
              type: "crosspost:set-csdn-markdown"
            });
            if (!isSetCsdnMarkdownResponse(response)) {
              throw new Error("CSDN returned an invalid editor response.");
            }
            if (!response.applied) {
              throw new Error(
                response.message ?? "CSDN rejected the source Markdown."
              );
            }
            return response.markdown;
          },
          uploadBilibiliImage: async (file, token) => {
            const response: unknown = await browser.runtime.sendMessage({
              dataUrl: await fileToDataUrl(file),
              fileName: file.name || "crosspost-image.png",
              mimeType: file.type || "image/png",
              token,
              type: "crosspost:upload-bilibili-image"
            });
            if (!isUploadBilibiliImageResponse(response)) {
              throw new Error("Bilibili returned an invalid image upload response.");
            }
            if (!response.uploaded) {
              throw new Error(
                response.message ?? "Bilibili rejected the image upload."
              );
            }
            return response.url;
          }
        }).then(
          sendResponse,
          (error: unknown) => {
            sendResponse({
              errorCode: "content-script-failed",
              message:
                error instanceof Error ? error.message : "The content script failed.",
              saved: false
            } satisfies ApplyDraftResult);
          }
        );
        return true;
      }
    );
  }
});
