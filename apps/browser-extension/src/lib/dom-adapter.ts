import type { ApplyDraftPayload, ApplyDraftResult } from "./messages";
import {
  resolveBaijiahaoEditor,
  summarizeBaijiahaoEditorCandidates,
  summarizeBaijiahaoTitleRegion
} from "./dom/baijiahao";
import { BAIJIAHAO_ADAPTER_REVISION, DEFINITIONS } from "./dom/definitions";
import { activateDraftEditor, editableText } from "./dom/editor";
import { insertIntoEditor } from "./dom/insert";
import {
  markdownEditorText,
  markdownEditorVisibleText,
  normalizedMarkdownDocument
} from "./dom/markdown";
import {
  queryExactVisibleText,
  queryFirst,
  summarizeVisibleEditors
} from "./dom/query";
import { normalizedRichText } from "./dom/richtext";
import {
  saveEvidenceSignature,
  waitForSaveEvidence
} from "./dom/save-evidence";
import {
  isEditableTitle,
  isTextArea,
  resolveTitle,
  setTitleValue
} from "./dom/title";
import { InvalidInlineImageError } from "./dom/types";
import type { DomAdapterRuntime } from "./dom/types";

export { extractEmbeddedImages, extractEmbeddedMarkdownImages } from "./dom/images";
export { htmlToPlainText } from "./dom/richtext";
export type { DomAdapterRuntime } from "./dom/types";

export async function applyDraftToVisibleEditor(
  payload: ApplyDraftPayload,
  runtime?: DomAdapterRuntime
): Promise<ApplyDraftResult> {
  if (payload.html.includes("crosspost-asset://") || payload.markdown.includes("crosspost-asset://")) {
    return {
      errorCode: "unresolved-assets",
      message: "The article still contains unresolved assets.",
      saved: false
    };
  }

  const definition = DEFINITIONS[payload.platform];
  await activateDraftEditor(payload.platform, definition);
  const title = await resolveTitle(payload.platform, definition, payload.title);
  const resolveEditor = (): HTMLElement | undefined =>
    payload.platform === "baijiahao"
      ? resolveBaijiahaoEditor(title)
      : queryFirst(definition.editorSelectors, title);
  const editor = resolveEditor();
  if (!title || !isEditableTitle(title) || !editor) {
    const titleState = !title
      ? "missing"
      : isEditableTitle(title)
        ? "found"
        : "not-editable";
    return {
      errorCode: "editor-not-found",
      message: `The visible draft editor was not recognized (${
        payload.platform === "baijiahao"
          ? `adapter=${BAIJIAHAO_ADAPTER_REVISION}; `
          : ""
      }title=${titleState}, body=${
        editor ? "found" : "missing"
      }${
        payload.platform === "baijiahao"
          ? `; editor candidates: ${summarizeBaijiahaoEditorCandidates(title)}; title region: ${summarizeBaijiahaoTitleRegion()}`
          : ""
      }; visible controls: ${summarizeVisibleEditors()}). Sign in, open a draft, and retry.`,
      saved: false
    };
  }

  const initialSaveStatus = saveEvidenceSignature(definition);
  setTitleValue(title, payload.title);
  try {
    await insertIntoEditor(editor, payload, resolveEditor, definition, runtime);
  } catch (error) {
    return {
      draftUrl: location.href,
      errorCode:
        error instanceof InvalidInlineImageError
          ? "invalid-inline-image"
          : "editor-update-unconfirmed",
      message:
        payload.platform === "baijiahao"
          ? `adapter=${BAIJIAHAO_ADAPTER_REVISION}; ${
              error instanceof Error
                ? error.message
                : "The platform did not confirm all image uploads."
            }`
          : error instanceof Error
            ? error.message
            : "The platform did not confirm all image uploads.",
      saved: false,
      unknown: true
    };
  }

  if (definition.blurAfterInsert) {
    const completedEditor = resolveEditor() ?? editor;
    completedEditor.blur();
    title.focus();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 100);
    });
  }

  if (definition.postInsertSettleMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, definition.postInsertSettleMs);
    });
  }

  let saveEvidenceBaseline = initialSaveStatus;
  if (definition.saveActionText) {
    const saveActionTexts = Array.isArray(definition.saveActionText)
      ? definition.saveActionText
      : [definition.saveActionText];
    const saveAction = saveActionTexts
      .map((text) => queryExactVisibleText(text))
      .find((element) => element !== undefined);
    if (!saveAction) {
      return {
        draftUrl: location.href,
        errorCode: "save-action-not-found",
        message: `The visible ${saveActionTexts.join("/")} action was not found. Do not create another draft automatically.`,
        saved: false,
        unknown: true
      };
    }
    if (definition.requireSaveEvidenceAfterAction) {
      saveEvidenceBaseline = saveEvidenceSignature(definition);
    }
    saveAction.click();
  }

  if (!(await waitForSaveEvidence(
    definition,
    saveEvidenceBaseline,
    definition.deferSaveEvidenceToReload ? 3_000 : 20_000
  ))) {
    if (definition.acceptSaveActionWithoutEvidence && definition.saveActionText) {
      const completedEditor = resolveEditor() ?? editor;
      const bodyText = isTextArea(completedEditor)
        ? markdownEditorText(completedEditor)
        : editableText(completedEditor);
      return {
        bodyText: isTextArea(completedEditor)
          ? normalizedMarkdownDocument(bodyText)
          : normalizedRichText(bodyText),
        draftUrl: location.href,
        imageCount: isTextArea(completedEditor)
          ? (bodyText.match(/!\[[^\]]*\]\(https?:\/\//g) ?? []).length
          : completedEditor.querySelectorAll("img").length,
        message:
          "The visible draft action was invoked after the editor content was verified.",
        saved: true
      };
    }
    if (definition.deferSaveEvidenceToReload) {
      const completedEditor = resolveEditor() ?? editor;
      const markdownReadback =
        definition.contentMode === "markdown" || isTextArea(completedEditor);
      const bodyText = isTextArea(completedEditor)
        ? markdownEditorText(completedEditor)
        : definition.contentMode === "markdown"
          ? markdownEditorVisibleText(completedEditor)
          : editableText(completedEditor);
      return {
        bodyText: markdownReadback
          ? normalizedMarkdownDocument(bodyText)
          : normalizedRichText(bodyText),
        draftUrl: location.href,
        imageCount: markdownReadback
          ? (bodyText.match(/!\[[^\]]*\]\(https?:\/\//g) ?? []).length
          : completedEditor.querySelectorAll("img").length,
        message:
          "The editor accepted the draft; persistence will be verified after reload.",
        saved: true
      };
    }
    return {
      draftUrl: location.href,
      errorCode: "save-unconfirmed",
      message:
        "The editor was filled, but no explicit draft-saved signal appeared. Do not create another draft automatically.",
      saved: false,
      unknown: true
    };
  }

  const completedEditor = resolveEditor() ?? editor;
  const bodyText = isTextArea(completedEditor)
    ? markdownEditorText(completedEditor)
    : editableText(completedEditor);
  return {
    bodyText: isTextArea(completedEditor)
      ? normalizedMarkdownDocument(bodyText)
      : normalizedRichText(bodyText),
    draftUrl: location.href,
    imageCount: isTextArea(completedEditor)
      ? (bodyText.match(/!\[[^\]]*\]\(https?:\/\//g) ?? []).length
      : completedEditor.querySelectorAll("img").length,
    message: "The platform displayed an explicit draft-saved signal.",
    saved: true
  };
}
