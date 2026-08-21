import type { ApplyDraftPayload } from "../messages";
import {
  clearEditor,
  dispatchEditorInput,
  focusEditor,
  hasEditorContent,
  replaceEditorHtml,
  selectEditorContents,
  selectionIsInside
} from "./editor";
import {
  extractEmbeddedImages,
  extractEmbeddedMarkdownImages,
  MarkdownImageDialogUnavailableError,
  pasteImageAtToken
} from "./images";
import {
  markdownDocumentMatches,
  pasteMarkdownImageAtToken,
  setContenteditableMarkdown,
  setTextareaMarkdown,
  uploadContenteditableMarkdownImagesWithDialog,
  uploadMarkdownImageAtTokenWithDialog,
  uploadTextareaMarkdownImages,
  uploadTextareaMarkdownImagesWithDialog
} from "./markdown";
import { queryFirst, waitFor } from "./query";
import {
  htmlToPlainText,
  richEditorContainsHtmlText,
  richEditorReadbackMismatch
} from "./richtext";
import { isTextArea } from "./title";
import { InvalidInlineImageError } from "./types";
import type { DomAdapterRuntime, PlatformDomDefinition } from "./types";

export async function insertIntoEditor(
  editor: HTMLElement,
  payload: ApplyDraftPayload,
  resolveEditor: () => HTMLElement | undefined,
  definition: PlatformDomDefinition,
  runtime?: DomAdapterRuntime
): Promise<void> {
  focusEditor(editor);
  const useMarkdown =
    definition.contentMode === "markdown" ||
    (definition.contentMode === "adaptive" &&
      (isTextArea(editor) ||
        Boolean(
          editor.closest(
            ".CodeMirror, .cm-editor, .monaco-editor, .bytemd-editor"
          )
        )));
  if (useMarkdown) {
    const prepared = extractEmbeddedMarkdownImages(payload.markdown, payload.jobId);
    if (/data:image\//i.test(prepared.markdown)) {
      throw new InvalidInlineImageError(
        "The article contains an invalid inline image that could not be prepared for upload."
      );
    }
    if (isTextArea(editor)) {
      const applyTextareaMarkdown = (
        currentEditor: HTMLTextAreaElement,
        markdown: string
      ): Promise<void> =>
        setTextareaMarkdown(
          payload.platform,
          currentEditor,
          markdown,
          runtime
        );
      const deferSegmentFaultMarkdown =
        payload.platform === "segmentfault" &&
        prepared.images.length > 0 &&
        Boolean(
          definition.markdownImageDialog?.triggerSelectors.some((selector) =>
            queryFirst([selector])
          )
        );
      if (!deferSegmentFaultMarkdown) {
        await applyTextareaMarkdown(editor, prepared.markdown);
      }
      if (
        definition.imageStrategy !== "rich-paste" &&
        prepared.images.length > 0
      ) {
        if (definition.markdownImageDialog) {
          try {
            await uploadTextareaMarkdownImagesWithDialog(
              resolveEditor,
              prepared.images,
              prepared.markdown,
              definition.markdownImageDialog,
              applyTextareaMarkdown
            );
          } catch (error) {
            if (!(error instanceof MarkdownImageDialogUnavailableError)) {
              throw error;
            }
            await uploadTextareaMarkdownImages(
              resolveEditor,
              prepared.images,
              prepared.markdown,
              applyTextareaMarkdown
            );
          }
        } else {
          await uploadTextareaMarkdownImages(
            resolveEditor,
            prepared.images,
            prepared.markdown,
            applyTextareaMarkdown
          );
        }
        return;
      }
    } else {
      if (
        definition.rewriteMarkdownAfterDialogUploads &&
        definition.markdownImageDialog
      ) {
        await setContenteditableMarkdown(editor, prepared.markdown, runtime);
        const initialMarkdownApplied = await waitFor(() => {
          const current = resolveEditor();
          return Boolean(
            current &&
              markdownDocumentMatches(current, prepared.markdown)
          );
        }, 5_000);
        if (!initialMarkdownApplied) {
          throw new Error("The Markdown editor did not accept the source document.");
        }
        if (prepared.images.length > 0) {
          await uploadContenteditableMarkdownImagesWithDialog(
            resolveEditor,
            prepared.images,
            prepared.markdown,
            definition.markdownImageDialog,
            runtime
          );
        }
        return;
      }
      let currentEditor = await clearEditor(resolveEditor);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      currentEditor = resolveEditor() ?? currentEditor;
      focusEditor(currentEditor);
      selectEditorContents(currentEditor);
      let accepted = false;
      if (typeof DataTransfer !== "undefined" && typeof ClipboardEvent !== "undefined") {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", prepared.markdown);
        accepted = !currentEditor.dispatchEvent(
          new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: transfer
          })
        );
      }
      const pasteApplied =
        accepted &&
        (await waitFor(() => {
          const liveEditor = resolveEditor();
          return Boolean(liveEditor && hasEditorContent(liveEditor));
        }, 5_000));
      currentEditor = resolveEditor() ?? currentEditor;
      if (!pasteApplied && !hasEditorContent(currentEditor)) {
        currentEditor.textContent = prepared.markdown;
        dispatchEditorInput(currentEditor, "insertFromPaste");
      }
    }
    if (definition.imageStrategy !== "rich-paste") {
      for (const image of prepared.images) {
        if (definition.markdownImageDialog) {
          try {
            await uploadMarkdownImageAtTokenWithDialog(
              resolveEditor,
              image,
              definition.markdownImageDialog
            );
          } catch (error) {
            if (!(error instanceof MarkdownImageDialogUnavailableError)) {
              throw error;
            }
            await pasteMarkdownImageAtToken(resolveEditor, image);
          }
        } else {
          await pasteMarkdownImageAtToken(resolveEditor, image);
        }
      }
    }
    return;
  }

  const prepared =
    definition.imageStrategy !== "markdown-paste"
      ? extractEmbeddedImages(payload.html, payload.jobId)
      : { html: payload.html, images: [] };
  if (/data:image\//i.test(prepared.html)) {
    throw new InvalidInlineImageError(
      "The article contains an invalid inline image that could not be prepared for upload."
    );
  }
  const replaceExistingByPaste = Boolean(
    definition.replaceExistingRichContentByPaste && hasEditorContent(editor)
  );
  let currentEditor = replaceExistingByPaste
    ? editor
    : await clearEditor(resolveEditor);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  currentEditor = resolveEditor() ?? currentEditor;
  focusEditor(currentEditor);
  selectEditorContents(currentEditor);
  const editorFocused = await waitFor(() => {
    const liveEditor = resolveEditor();
    return Boolean(
      liveEditor &&
      liveEditor.ownerDocument.activeElement === liveEditor &&
      selectionIsInside(liveEditor)
    );
  }, 1_000);
  if (!editorFocused) {
    throw new Error(
      "The replacement editor did not regain focus before replacing the previous draft."
    );
  }
  let accepted = false;
  let pasteApplied = false;
  if (definition.preferDirectDomInsert) {
    replaceEditorHtml(currentEditor, prepared.html);
    dispatchEditorInput(currentEditor, "insertFromPaste");
    pasteApplied = await waitFor(() => {
      const liveEditor = resolveEditor();
      return Boolean(
        liveEditor &&
          hasEditorContent(liveEditor) &&
          richEditorContainsHtmlText(liveEditor, prepared.html)
      );
    }, 1_000);
  } else if (
    typeof DataTransfer !== "undefined" &&
    typeof ClipboardEvent !== "undefined"
  ) {
    const transfer = new DataTransfer();
    transfer.setData("text/html", prepared.html);
    transfer.setData("text/plain", htmlToPlainText(prepared.html));
    accepted = !currentEditor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
    pasteApplied =
      accepted &&
      (await waitFor(() => {
        const liveEditor = resolveEditor();
        if (
          !liveEditor ||
          !hasEditorContent(liveEditor) ||
          !richEditorContainsHtmlText(liveEditor, prepared.html)
        ) {
          return false;
        }
        if (replaceExistingByPaste && prepared.images.length > 0) {
          return prepared.images.every((image) =>
            liveEditor.textContent?.includes(image.token)
          );
        }
        return true;
      }, 5_000));
  }
  currentEditor = resolveEditor() ?? currentEditor;
  if (replaceExistingByPaste && !pasteApplied) {
    throw new Error(
      "The rich-text editor did not confirm replacement of the previous draft."
    );
  }
  if (pasteApplied) {
    for (const image of prepared.images) {
      await pasteImageAtToken(
        resolveEditor,
        image,
        definition.richImageDropFallback,
        definition.nativeRichImageUpload
          ? runtime?.uploadBilibiliImage
          : undefined
      );
    }
    const persistedEditor = resolveEditor() ?? currentEditor;
    if (
      !definition.skipFinalRichTextReadback &&
      !richEditorContainsHtmlText(persistedEditor, payload.html)
    ) {
      throw new Error(richEditorReadbackMismatch(persistedEditor, payload.html));
    }
    return;
  }
  if (accepted) {
    throw new Error(
      "The editor accepted the paste event but did not apply the rich-text content."
    );
  }

  replaceEditorHtml(currentEditor, prepared.html);
  dispatchEditorInput(currentEditor, "insertFromPaste");
  for (const image of prepared.images) {
    await pasteImageAtToken(
      resolveEditor,
      image,
      definition.richImageDropFallback,
      definition.nativeRichImageUpload
        ? runtime?.uploadBilibiliImage
        : undefined
    );
  }
  const finalizedEditor = resolveEditor() ?? currentEditor;
  if (!richEditorContainsHtmlText(finalizedEditor, payload.html)) {
    throw new Error(richEditorReadbackMismatch(finalizedEditor, payload.html));
  }
}
