import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { applyDraftToVisibleEditor } from "../lib/dom-adapter";
import type {
  ApplyDraftMessage,
  ApplyDraftResult,
  ContentPingMessage
} from "../lib/messages";

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
        void applyDraftToVisibleEditor(message.payload).then(
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
