import type {
  ApplyDraftPayload,
  ApplyDraftResult,
  BrowserPlatform
} from "./messages";
import { browserSvgToPng } from "@crosspost/core/rasterize";

interface PlatformDomDefinition {
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

interface MarkdownImageDialogDefinition {
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

interface EmbeddedImage {
  alt?: string;
  file: File;
  token: string;
}

export interface DomAdapterRuntime {
  setCsdnMarkdown?: (markdown: string) => Promise<string | undefined>;
  setSegmentFaultMarkdown?: (markdown: string) => Promise<string | undefined>;
  uploadBilibiliImage?: (file: File, token: string) => Promise<string | undefined>;
}

class InvalidInlineImageError extends Error {}
class MarkdownImageDialogUnavailableError extends Error {}

const ZHIHU_IMPORT_FAILURE_IMAGE =
  "v2-4f89913ab376925632be5823a038f938";
const BAIJIAHAO_ADAPTER_REVISION = "feeditor-ueditor-v7";
const BAIJIAHAO_EXPLICIT_TITLE_SELECTORS = [
  "textarea[placeholder^='请输入标题']",
  "input[placeholder^='请输入标题']",
  "[contenteditable]:not([contenteditable='false'])[data-placeholder*='请输入标题']",
  "[contenteditable]:not([contenteditable='false'])[aria-label*='标题']",
  ".input-box > [contenteditable]:not([contenteditable='false'])",
  ".input-box [contenteditable]:not([contenteditable='false'])",
  "[class*='placeholder'] + [contenteditable]:not([contenteditable='false'])"
];
const BAIJIAHAO_FEEDITOR_TITLE_SELECTORS = [
  "[class*='FeEditorApp-'][class*='-container'] [class*='FeEditorApp-'][class*='-editor'][contenteditable]:not([contenteditable='false'])",
  "[class*='FeEditorApp-'][class*='-editor'][contenteditable]:not([contenteditable='false'])"
];

const DEFINITIONS: Record<BrowserPlatform, PlatformDomDefinition> = {
  "51cto": {
    contentMode: "markdown",
    editorSelectors: [
      "textarea[placeholder='请输入正文']",
      "textarea#content",
      "textarea[name='content']",
      ".bytemd-editor .CodeMirror textarea",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    saveEvidenceSelectors: [
      ".save-draft",
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      ".el-message--success",
      "[role='status']"
    ],
    saveEvidenceText: /草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input#title",
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']"
    ]
  },
  baijiahao: {
    blurAfterInsert: true,
    contentMode: "rich-html",
    editorReadyTimeoutMs: 8_000,
    editorSelectors: [
      ".edui-body-container[contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[data-slate-editor='true'][contenteditable='true']",
      "[data-lexical-editor='true'][contenteditable='true']",
      "[contenteditable='true'][data-placeholder*='请输入正文']",
      ".edui-body-container",
      ".editor-outter-wrapper iframe",
      ".ueditor iframe",
      ".edui-editor iframe",
      ".public-DraftEditor-content[contenteditable='true']",
      ".ql-editor[contenteditable='true']",
      "[class*='editor'] [contenteditable='true']"
    ],
    imageStrategy: "rich-paste",
    postInsertSettleMs: 500,
    preferDirectDomInsert: true,
    requireSaveEvidenceAfterAction: true,
    saveActionText: "存草稿",
    saveEvidenceSelectors: [
      "[role='alert']",
      "[class*='toast']",
      "[class*='message']",
      "[class*='save-status']",
      "[class*='draft-status']",
      ".ant-message-success",
      "[role='status']"
    ],
    saveEvidenceText:
      /存草稿成功|保存草稿成功|草稿已保存|保存成功|已保存至草稿箱/,
    skipFinalRichTextReadback: true,
    titleSelectors: [
      ...BAIJIAHAO_EXPLICIT_TITLE_SELECTORS,
      ...BAIJIAHAO_FEEDITOR_TITLE_SELECTORS,
      "[class*='title'] [contenteditable]:not([contenteditable='false'])",
      "[class*='Title'] [contenteditable]:not([contenteditable='false'])",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "textarea[class*='title']"
    ]
  },
  bilibili: {
    contentMode: "rich-html",
    editorSelectors: [
      ".tiptap.ProseMirror.eva3-editor[contenteditable='true']",
      "textarea[placeholder='请输入正文']",
      "[contenteditable='true'][data-placeholder='请输入正文']",
      "[contenteditable='true'][aria-label='请输入正文']",
      ".ql-editor[contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      ".w-e-text[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[class*='editor'] [contenteditable='true']"
    ],
    imageStrategy: "rich-paste",
    nativeRichImageUpload: true,
    postInsertSettleMs: 1_500,
    replaceExistingRichContentByPaste: true,
    richImageDropFallback: true,
    saveActionText: "保存为草稿",
    saveEvidenceSelectors: [
      ".save-tip",
      ".vui_toast",
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      "[class*='auto-save']",
      "[role='status']"
    ],
    saveEvidenceText:
      /草稿已保存|保存草稿成功|保存成功|自动保存成功|已自动保存|已保存/,
    titleSelectors: [
      "textarea.title-input__inner[placeholder*='标题']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "textarea[class*='title']"
    ]
  },
  jianshu: {
    contentMode: "rich-html",
    editorSelectors: [
      "#editor .kalamu-area[contenteditable='true']",
      ".kalamu-area[contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      ".public-DraftEditor-content[contenteditable='true']",
      "div[data-div]",
      "div#arthur-editor"
    ],
    imageStrategy: "rich-paste",
    replaceExistingRichContentByPaste: true,
    saveEvidenceSelectors: [
      "div:has(#editor) > p",
      "p._3-3KB",
      "[class*='save']",
      "[class*='Save']",
      "[class*='status']",
      "[class*='Status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|已保存/,
    titleSelectors: [
      "div:has(> div > #editor) > input",
      "div:has(> ul [data-action='publicize']):has(#editor) > input[type='text']",
      "input._24i7u",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "input#title"
    ]
  },
  cnblogs: {
    contentMode: "markdown",
    editorSelectors: [
      "textarea#md-editor",
      "textarea#post-body",
      "textarea[name='postBody']",
      ".monaco-editor textarea.inputarea",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    saveActionText: ["存为草稿", "保存草稿"],
    saveEvidenceSelectors: [
      "[data-el-locator='post-saved-page']",
      ".message-panel-header",
      ".ant-message-success",
      "[role='status']",
      "[class*='save-status']",
      "[class*='autosave']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input.field__control--title",
      "input#post-title",
      "input#Editor_Edit_txbTitle",
      "input[name='postTitle']",
      "input[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  csdn: {
    contentMode: "markdown",
    editorReadyTimeoutMs: 8_000,
    editorSelectors: [
      "pre.editor__inner.markdown-highlighting[contenteditable='true']",
      ".monaco-editor textarea.inputarea",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea[class*='editor']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    rewriteMarkdownAfterDialogUploads: true,
    markdownImageDialog: {
      closeSelectors: ["button.modal__close-button", "button[aria-label='关闭']"],
      confirmText: "确定",
      dialogSelectors: ["[role='dialog'][aria-label='Insert image']"],
      inputSelectors: [
        "[role='dialog'][aria-label='Insert image'] input[type='file'][accept*='image']"
      ],
      triggerSelectors: ["button[data-title^='图片']"]
    },
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='autosave']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText: /草稿已保存|文章已保存|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input#txtTitle",
      "input[value='【无标题】']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']",
      "[contenteditable='true'][class*='title']"
    ]
  },
  juejin: {
    contentMode: "adaptive",
    editorSelectors: [
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      ".bytemd-editor .CodeMirror textarea",
      "textarea"
    ],
    imageStrategy: "adaptive",
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText: /草稿已保存|保存成功|已保存/,
    titleSelectors: [
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  oschina: {
    contentMode: "rich-html",
    editorSelectors: [
      ".tiptap.ProseMirror.aie-content[contenteditable='true']",
      ".ProseMirror[contenteditable='true'][role='textbox']",
      "[contenteditable='true'][role='textbox']",
      "textarea#markdownContent",
      "textarea[name='content']",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "rich-paste",
    replaceExistingRichContentByPaste: true,
    saveActionText: "草稿箱",
    saveEvidenceSelectors: [
      ".ant-message-success",
      ".publish-right-title",
      "[class*='save-status']",
      "[class*='autosave']",
      "[class*='draft-status']",
      "[class*='status']"
    ],
    saveEvidenceText:
      /文章.*保存至草稿箱|保存草稿成功|草稿已保存|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  segmentfault: {
    blurAfterInsert: true,
    contentMode: "markdown",
    deferSaveEvidenceToReload: true,
    editorSelectors: [
      ".cm-editor .cm-content[contenteditable='true']",
      ".CodeMirror textarea",
      ".monaco-editor textarea.inputarea",
      "textarea[name='text']",
      "textarea[aria-label*='Editor content']",
      "textarea"
    ],
    imageStrategy: "markdown-paste",
    rewriteMarkdownAfterDialogUploads: true,
    markdownImageDialog: {
      closeSelectors: ["button[aria-label='Close']", "button.btn-close"],
      confirmText: "确定",
      dialogSelectors: ["[role='dialog'][aria-modal='true']"],
      inputSelectors: [
        "[role='dialog'] input[type='file'][id='editor.imgLink']"
      ],
      retryCount: 1,
      retryDelayMs: 5_000,
      triggerSelectors: ["button.icon-image"],
      uploadPacingMs: 2_500,
      uploadTimeoutMs: 15_000
    },
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      "[data-testid*='save']",
      "[role='status']"
    ],
    saveEvidenceText: /草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "input[name='title']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  tencentcloud: {
    contentMode: "adaptive",
    editorReadyTimeoutMs: 8_000,
    editorSelectors: [
      ".tiptap.ProseMirror.cdc-rich-editor[contenteditable='true']",
      ".CodeMirror textarea",
      ".cm-editor .cm-content[contenteditable='true']",
      ".monaco-editor textarea.inputarea",
      ".ProseMirror[contenteditable='true']",
      ".ql-editor[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "textarea[aria-label*='Editor content']",
      "textarea[class*='editor']"
    ],
    imageStrategy: "adaptive",
    saveActionText: "存草稿",
    saveEvidenceSelectors: [
      "[role='alert']",
      "[class*='message']",
      "[class*='toast']",
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      "[class*='auto-save']",
      "[role='status']"
    ],
    saveEvidenceText:
      /保存草稿成功|草稿已保存|内容已自动保存|保存成功|自动保存成功|已自动保存|已保存/,
    titleSelectors: [
      "textarea.cdc-article-editor__title-input",
      "input[placeholder*='文章标题']",
      "textarea[placeholder*='文章标题']",
      "input[placeholder*='标题']",
      "textarea[placeholder*='标题']",
      "input[class*='title']"
    ]
  },
  toutiao: {
    blurAfterInsert: true,
    contentMode: "rich-html",
    deferSaveEvidenceToReload: true,
    editorReadyTimeoutMs: 10_000,
    editorSelectors: [
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']",
      "[data-slate-editor='true'][contenteditable='true']",
      ".public-DraftEditor-content[contenteditable='true']",
      "[class*='editor'] [contenteditable='true']"
    ],
    imageStrategy: "rich-paste",
    postInsertSettleMs: 1_000,
    replaceExistingRichContentByPaste: true,
    saveEvidenceSelectors: [
      "[class*='save-status']",
      "[class*='draft-status']",
      "[class*='autosave']",
      ".byte-toast",
      "[role='status']"
    ],
    saveEvidenceText:
      /已保存至草稿箱|草稿已保存|草稿保存成功|保存成功|自动保存成功|已保存/,
    titleSelectors: [
      "textarea[placeholder*='标题']",
      "input[placeholder*='标题']",
      "textarea[class*='title']",
      "input[class*='title']"
    ]
  },
  zhihu: {
    contentMode: "rich-html",
    editorSelectors: [
      ".public-DraftEditor-content[contenteditable='true']",
      ".DraftEditor-root [contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][role='textbox']"
    ],
    imageStrategy: "rich-paste",
    saveEvidenceSelectors: [
      "[class*='Save']",
      "[class*='save']",
      "[class*='Status']",
      "[class*='status']"
    ],
    saveEvidenceText:
      /草稿已保存|保存成功|已保存|(?:刚刚|\d+\s*(?:秒|分钟)前)\s*·\s*草稿/,
    titleSelectors: [
      "textarea[placeholder*='标题']",
      "input[placeholder*='标题']",
      "textarea[class*='title']",
      "input[class*='title']"
    ]
  }
};

function queryAllDeep<T extends Element>(
  selector: string,
  root: ParentNode = document
): T[] {
  const matches = Array.from(root.querySelectorAll<T>(selector));
  for (const host of root.querySelectorAll<HTMLElement>("*")) {
    if (host.shadowRoot) {
      matches.push(...queryAllDeep<T>(selector, host.shadowRoot));
    }
  }
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    try {
      if (frame.contentDocument) {
        matches.push(...queryAllDeep<T>(selector, frame.contentDocument));
      }
    } catch {
      // Cross-origin frames are intentionally inaccessible to the adapter.
    }
  }
  return matches;
}

function queryFirst(
  selectors: string[],
  excluded?: HTMLElement
): HTMLElement | undefined {
  for (const selector of selectors) {
    for (const element of queryAllDeep<HTMLElement>(selector)) {
      if (element !== excluded && element.getClientRects().length > 0) {
        return element;
      }
    }
  }
  return undefined;
}

function resolveBaijiahaoEditor(title?: HTMLElement): HTMLElement | undefined {
  const directEditor = queryFirst(
    [
      ".edui-body-container[contenteditable]:not([contenteditable='false'])",
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'][data-placeholder*='请输入正文']",
      "[data-slate-editor='true'][contenteditable='true']",
      "[data-lexical-editor='true'][contenteditable='true']",
      ".public-DraftEditor-content[contenteditable='true']",
      ".ql-editor[contenteditable='true']"
    ],
    title
  );
  if (directEditor) {
    return directEditor;
  }

  for (const frame of queryAllDeep<HTMLIFrameElement>(
    ".editor-outter-wrapper iframe, .ueditor iframe, .edui-editor iframe"
  )) {
    if (frame.getClientRects().length === 0) {
      continue;
    }
    try {
      const body = frame.contentDocument?.body;
      if (body && body !== title) {
        return body;
      }
    } catch {
      // Baijiahao's editor iframe is expected to be same-origin. If that changes,
      // continue to the visible fallback editor instead of touching a private API.
    }
  }

  return queryFirst(
    [
      ".edui-body-container",
      "[contenteditable='true'][role='textbox']",
      "[class*='editor'] [contenteditable='true']"
    ],
    title
  );
}

function queryDialogInput(
  selectors: string[],
  dialog: HTMLElement
): HTMLInputElement | undefined {
  for (const selector of selectors) {
    for (const input of document.querySelectorAll<HTMLInputElement>(selector)) {
      if (dialog.contains(input)) {
        return input;
      }
    }
  }
  return undefined;
}

function queryExactVisibleText(
  value: string,
  root: ParentNode = document
): HTMLElement | undefined {
  return queryAllDeep<HTMLElement>("*", root)
    .find(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim() === value &&
      element.getClientRects().length > 0
  );
}

async function activateDraftEditor(
  platform: BrowserPlatform,
  definition: PlatformDomDefinition
): Promise<void> {
  const editorIsReady = (): boolean =>
    Boolean(queryFirst(definition.editorSelectors));
  if (editorIsReady()) {
    return;
  }
  if (
    definition.editorReadyTimeoutMs &&
    (await waitFor(editorIsReady, definition.editorReadyTimeoutMs))
  ) {
    return;
  }

  const activatorText =
    platform === "jianshu"
      ? "新建文章"
      : platform === "oschina"
        ? "切换到MD编辑器"
        : undefined;
  if (!activatorText) {
    return;
  }
  const activator = queryExactVisibleText(activatorText);
  if (!activator) {
    return;
  }
  activator.click();
  await waitFor(
    () =>
      Boolean(
        queryFirst(definition.titleSelectors) &&
          queryFirst(definition.editorSelectors)
      ),
    8_000
  );
}

async function resolveTitle(
  platform: BrowserPlatform,
  definition: PlatformDomDefinition,
  expectedTitle: string
): Promise<HTMLElement | undefined> {
  const existing = queryFirst(
    platform === "baijiahao"
      ? BAIJIAHAO_EXPLICIT_TITLE_SELECTORS
      : definition.titleSelectors
  );
  if (existing) {
    return existing;
  }
  if (platform === "baijiahao") {
    const marker = queryVisibleTextPrefix("请输入标题");
    marker?.click();
    if (
      marker &&
      (await waitFor(
        () => Boolean(queryFirst(BAIJIAHAO_EXPLICIT_TITLE_SELECTORS)),
        1_000
      ))
    ) {
      return queryFirst(BAIJIAHAO_EXPLICIT_TITLE_SELECTORS);
    }
    const knownEditor = resolveBaijiahaoEditor();
    const nearbyTitle = queryEditableNearVisibleText(
      "请输入标题",
      knownEditor
    );
    if (nearbyTitle) {
      return nearbyTitle;
    }
    const hasUeditorShell = Boolean(
      queryFirst([".editor-outter-wrapper", ".ueditor", ".edui-editor"])
    );
    return hasUeditorShell
      ? queryFirst(BAIJIAHAO_FEEDITOR_TITLE_SELECTORS, knownEditor)
      : undefined;
  }
  if (platform !== "csdn") {
    return undefined;
  }
  const activator =
    queryExactVisibleText("【无标题】") ?? queryExactVisibleText(expectedTitle);
  if (!activator) {
    return undefined;
  }
  activator.click();
  await waitFor(() => Boolean(queryFirst(definition.titleSelectors)), 1_000);
  return queryFirst(definition.titleSelectors);
}

function queryVisibleTextPrefix(value: string): HTMLElement | undefined {
  return queryAllDeep<HTMLElement>("*").find(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim().startsWith(value) &&
      element.getClientRects().length > 0
  );
}

function queryEditableNearVisibleText(
  value: string,
  excluded?: HTMLElement
): HTMLElement | undefined {
  const markers = queryAllDeep<HTMLElement>("*").filter(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim().startsWith(value) &&
      element.getClientRects().length > 0
  );
  for (const marker of markers) {
    let container = marker.parentElement;
    for (let depth = 0; container && depth < 4; depth += 1) {
      const candidates = container.querySelectorAll<HTMLElement>(
        "input, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']"
      );
      for (const candidate of candidates) {
        if (
          candidate !== marker &&
          candidate !== excluded &&
          candidate.getClientRects().length > 0
        ) {
          return candidate;
        }
      }
      container = container.parentElement;
    }
  }
  return undefined;
}

function summarizeVisibleEditors(): string {
  const controls = queryAllDeep<HTMLElement>(
    "input, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox']"
  )
    .filter((element) => element.getClientRects().length > 0)
    .slice(0, 6)
    .map((element) => {
      const id = element.id ? `#${element.id}` : "";
      const classes = Array.from(element.classList)
        .slice(0, 3)
        .map((className) => `.${className}`)
        .join("");
      const placeholder = element.getAttribute("placeholder");
      const label = element.getAttribute("aria-label");
      const dataPlaceholder = element.getAttribute("data-placeholder");
      const contentEditable = element.getAttribute("contenteditable");
      const role = element.getAttribute("role");
      const hint = placeholder ?? dataPlaceholder ?? label;
      return `${element.localName}${id}${classes}${
        hint ? `[hint=${JSON.stringify(hint.slice(0, 80))}]` : ""
      }${contentEditable === null ? "" : `[contenteditable=${JSON.stringify(contentEditable)}]`}${
        role ? `[role=${JSON.stringify(role)}]` : ""
      }`;
    });
  return controls.length > 0 ? controls.join(", ") : "none";
}

function summarizeBaijiahaoTitleRegion(): string {
  const markers = queryAllDeep<HTMLElement>("*")
    .filter(
      (element) =>
        element.childElementCount === 0 &&
        element.textContent?.trim().startsWith("请输入标题") &&
        element.getClientRects().length > 0
    )
    .slice(0, 2);
  const describe = (element: HTMLElement): string => {
    const id = element.id ? `#${element.id}` : "";
    const classes = Array.from(element.classList)
      .slice(0, 4)
      .map((className) => `.${className}`)
      .join("");
    const attributes = [
      "aria-label",
      "contenteditable",
      "data-placeholder",
      "placeholder",
      "role",
      "tabindex"
    ]
      .flatMap((name) => {
        const value = element.getAttribute(name);
        return value === null ? [] : [`${name}=${JSON.stringify(value.slice(0, 80))}`];
      })
      .join(" ");
    const text =
      element.childElementCount === 0
        ? (element.textContent?.trim() ?? "").slice(0, 80)
        : "";
    return `${element.localName}${id}${classes}${attributes ? `[${attributes}]` : ""}${
      text ? `{text=${JSON.stringify(text)}}` : ""
    }`;
  };
  if (markers.length === 0) {
    return "marker=none";
  }
  return markers
    .map((marker) => {
      const parent = marker.parentElement;
      const siblings = parent
        ? Array.from(parent.children)
            .slice(0, 12)
            .map((element) => describe(element as HTMLElement))
            .join(",")
        : "none";
      return `marker=${describe(marker)}; parent=${
        parent ? describe(parent) : "none"
      }; siblings=${siblings}`;
    })
    .join(" | ");
}

function summarizeBaijiahaoEditorCandidates(title?: HTMLElement): string {
  const compact = (element: HTMLElement): string => {
    const classes = Array.from(element.classList)
      .slice(0, 3)
      .map((className) =>
        className.replace(/[a-f\d]{12,}/gi, "…")
      )
      .join(".");
    const contentEditable = element.getAttribute("contenteditable");
    const role = element.getAttribute("role");
    return `${element.localName}${classes ? `.${classes}` : ""}${
      contentEditable === null ? "" : `[ce=${JSON.stringify(contentEditable)}]`
    }${role ? `[role=${JSON.stringify(role)}]` : ""}{children=${
      element.childElementCount
    }}`;
  };
  const candidates = queryAllDeep<HTMLElement>(
    "iframe, [class*='editor'], [class*='Editor'], [class*='content'], [class*='Content']"
  )
    .filter(
      (element) =>
        element !== title &&
        !element.contains(title ?? null) &&
        !title?.contains(element) &&
        element.getClientRects().length > 0
    )
    .slice(0, 18)
    .map(compact);
  return candidates.length > 0 ? candidates.join(",") : "none";
}

function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.localName === "textarea";
}

function isTextInput(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement {
  return element.localName === "input" || isTextArea(element);
}

function isEditableTitle(element: HTMLElement): boolean {
  const contentEditable = element.getAttribute("contenteditable");
  return (
    isTextInput(element) ||
    element.isContentEditable ||
    (contentEditable !== null && contentEditable !== "false")
  );
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    isTextArea(element)
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setTitleValue(element: HTMLElement, value: string): void {
  if (isTextInput(element)) {
    setNativeValue(element, value);
    return;
  }
  element.focus();
  element.textContent = value;
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" })
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function focusEditor(editor: HTMLElement): void {
  editor.focus();
  if (editor.ownerDocument.activeElement === editor) {
    return;
  }
  if (
    editor.localName === "body" ||
    editor.classList.contains("edui-body-container")
  ) {
    editor.setAttribute("tabindex", "-1");
    editor.focus();
  }
}

function selectEditorContents(editor: HTMLElement): void {
  const editorDocument = editor.ownerDocument;
  const selection = editorDocument.defaultView?.getSelection();
  if (!selection) {
    return;
  }
  const range = editorDocument.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editorDocument.dispatchEvent(new Event("selectionchange", { bubbles: true }));
}

function selectionIsInside(editor: HTMLElement): boolean {
  const anchor = editor.ownerDocument.defaultView?.getSelection()?.anchorNode;
  return Boolean(
    anchor && (anchor === editor || editor.contains(anchor))
  );
}

function dispatchEditorInput(
  editor: HTMLElement,
  inputType: "deleteContentBackward" | "insertFromPaste"
): void {
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
}

function dataUrlToFile(dataUrl: string, name: string): File | undefined {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], name, { type: match[1] });
  } catch {
    return undefined;
  }
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/svg+xml") {
    return "svg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("The image file could not be read."));
    });
    reader.readAsText(file);
  });
}

async function browserCompatibleUploadFile(file: File): Promise<File> {
  if (file.type.toLowerCase() !== "image/svg+xml") {
    return file;
  }
  const rasterized = await browserSvgToPng(await readFileText(file), true);
  return new File(
    [new Uint8Array(rasterized.bytes)],
    file.name.replace(/\.svg$/i, ".png"),
    {
      lastModified: file.lastModified,
      type: "image/png"
    }
  );
}

export function extractEmbeddedImages(
  html: string,
  jobId: string
): { html: string; images: EmbeddedImage[] } {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const images: EmbeddedImage[] = [];
  for (const [index, image] of Array.from(
    parsed.body.querySelectorAll<HTMLImageElement>("img[src^='data:image/']")
  ).entries()) {
    const token = `CROSSPOST_IMAGE_${jobId.replaceAll("-", "")}_${index}`;
    const mimeType = image.src.slice(5, image.src.indexOf(";"));
    const file = dataUrlToFile(
      image.src,
      `crosspost-${index}.${extensionForMimeType(mimeType)}`
    );
    if (!file) {
      continue;
    }
    image.replaceWith(document.createTextNode(token));
    images.push({ file, token });
  }
  return { html: parsed.body.innerHTML, images };
}

export function extractEmbeddedMarkdownImages(
  markdown: string,
  jobId: string
): { images: EmbeddedImage[]; markdown: string } {
  const images: EmbeddedImage[] = [];
  const normalizedJobId = jobId.replaceAll("-", "");
  const registerImage = (
    dataUrl: string,
    mimeType: string,
    alt?: string
  ): string => {
    const token = `CROSSPOST_IMAGE_${normalizedJobId}_${images.length}`;
    const file = dataUrlToFile(
      dataUrl,
      `crosspost-${images.length}.${extensionForMimeType(mimeType.toLowerCase())}`
    );
    if (!file) {
      return dataUrl;
    }
    images.push({ alt, file, token });
    return token;
  };
  const withoutMarkdownImages = markdown.replace(
    /!\[([^\]]*)\]\((data:(image\/[^;,\s)]+);base64,[a-z0-9+/=]+)\)/gi,
    (_match, alt: string, dataUrl: string, mimeType: string) =>
      registerImage(dataUrl, mimeType, alt)
  );
  const preparedMarkdown = withoutMarkdownImages.replace(
    /data:(image\/[^;,\s)]+);base64,([a-z0-9+/=]+)/gi,
    (dataUrl, mimeType: string, _base64: string) => {
      return registerImage(dataUrl, mimeType);
    }
  );
  return { images, markdown: preparedMarkdown };
}

export function htmlToPlainText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

function replaceEditorHtml(editor: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(parsed.body.childNodes, (node) =>
    editor.ownerDocument.importNode(node, true)
  );
  editor.replaceChildren(...nodes);
}

function findTokenRange(editor: HTMLElement, token: string): Range | undefined {
  const editorDocument = editor.ownerDocument;
  const walker = editorDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent ?? "";
    const start = text.indexOf(token);
    if (start >= 0) {
      const range = editorDocument.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + token.length);
      return range;
    }
    node = walker.nextNode();
  }
  return undefined;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number
): Promise<boolean> {
  if (predicate()) {
    return true;
  }
  return new Promise((resolve) => {
    const finish = (result: boolean): void => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(result);
    };
    const observer = new MutationObserver(() => {
      if (!predicate()) {
        return;
      }
      finish(true);
    });
    const timeout = window.setTimeout(() => {
      finish(predicate());
    }, timeoutMs);
    const poll = window.setInterval(() => {
      if (predicate()) {
        finish(true);
      }
    }, 50);
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  });
}

function isResolvedRichEditorImage(image: HTMLImageElement): boolean {
  return (
    image.complete &&
    image.naturalWidth > 0 &&
    /^https?:\/\//.test(image.src) &&
    !image.src.includes(ZHIHU_IMPORT_FAILURE_IMAGE)
  );
}

function resolvedImageSourceCounts(editor: HTMLElement): Map<string, number> {
  const counts = new Map<string, number>();
  for (const image of editor.querySelectorAll<HTMLImageElement>("img")) {
    if (!isResolvedRichEditorImage(image)) {
      continue;
    }
    counts.set(image.src, (counts.get(image.src) ?? 0) + 1);
  }
  return counts;
}

function hasAdditionalResolvedImage(
  editor: HTMLElement,
  initialCounts: ReadonlyMap<string, number>
): boolean {
  const currentCounts = resolvedImageSourceCounts(editor);
  return Array.from(currentCounts).some(
    ([source, count]) => count > (initialCounts.get(source) ?? 0)
  );
}

function removeTransientRichEditorImages(editor: HTMLElement): void {
  let removed = false;
  for (const image of editor.querySelectorAll<HTMLImageElement>(
    "img[src^='data:'], img[src^='blob:']"
  )) {
    const container = image.closest(".eva3-enhanced-image-wrapper, figure");
    (container ?? image).remove();
    removed = true;
  }
  if (removed) {
    dispatchEditorInput(editor, "deleteContentBackward");
  }
}

function selectImageToken(
  editor: HTMLElement,
  token: string
): { range: Range; selection: Selection } | undefined {
  const range = findTokenRange(editor, token);
  const editorDocument = editor.ownerDocument;
  const selection = editorDocument.defaultView?.getSelection();
  if (!range || !selection) {
    return undefined;
  }
  focusEditor(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editorDocument.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  return { range, selection };
}

async function pasteImageAtToken(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage,
  useDropFallback = false,
  nativeUpload?: (file: File, token: string) => Promise<string | undefined>
): Promise<void> {
  const tokenAppeared = await waitFor(
    () => resolveEditor()?.textContent?.includes(image.token) === true,
    5_000
  );
  const editor = resolveEditor();
  if (!editor) {
    throw new Error("The editor was replaced before an image could be inserted.");
  }
  const insertion = tokenAppeared
    ? selectImageToken(editor, image.token)
    : undefined;
  if (!insertion) {
    throw new Error("An image insertion point was lost while filling the editor.");
  }

  if (nativeUpload) {
    const uploadFile = await browserCompatibleUploadFile(image.file);
    const uploadedUrl = await nativeUpload(uploadFile, image.token);
    if (
      !uploadedUrl ||
      !/^(?:https?:\/\/|data:image\/|blob:)/i.test(uploadedUrl)
    ) {
      throw new Error("The platform did not confirm its native image upload.");
    }
    const currentEditor = resolveEditor();
    if (!currentEditor) {
      throw new Error("The editor was replaced after its native image upload.");
    }
    const remainingToken = findTokenRange(currentEditor, image.token);
    if (remainingToken) {
      const selection = currentEditor.ownerDocument.defaultView?.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(remainingToken);
      remainingToken.deleteContents();
      dispatchEditorInput(currentEditor, "deleteContentBackward");
    }
    return;
  }

  const initialResolvedImages = resolvedImageSourceCounts(editor);
  const uploadFile = await browserCompatibleUploadFile(image.file);
  const transfer = new DataTransfer();
  transfer.items.add(uploadFile);
  const handled = !editor.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    })
  );
  if (!handled) {
    throw new Error("The editor did not accept an image file paste.");
  }

  const editorAfterPaste = resolveEditor();
  const hasTransientPaste = Boolean(
    editorAfterPaste?.querySelector("img[src^='data:'], img[src^='blob:']")
  );
  let uploaded = Boolean(
    editorAfterPaste &&
      hasAdditionalResolvedImage(editorAfterPaste, initialResolvedImages)
  );
  if (!uploaded && !(useDropFallback && hasTransientPaste)) {
    uploaded = await waitFor(
      () => {
        const currentEditor = resolveEditor();
        return Boolean(
          currentEditor &&
            hasAdditionalResolvedImage(currentEditor, initialResolvedImages)
        );
      },
      useDropFallback ? 1_500 : 30_000
    );
  }

  if (!uploaded && useDropFallback && typeof DragEvent !== "undefined") {
    const currentEditor = resolveEditor();
    if (currentEditor) {
      removeTransientRichEditorImages(currentEditor);
      const dropInsertion = selectImageToken(currentEditor, image.token);
      if (dropInsertion) {
        const dropTransfer = new DataTransfer();
        dropTransfer.items.add(uploadFile);
        const rect = dropInsertion.range.getBoundingClientRect?.();
        const dragInit: DragEventInit = {
          bubbles: true,
          cancelable: true,
          clientX: rect ? rect.left + rect.width / 2 : 0,
          clientY: rect ? rect.top + rect.height / 2 : 0,
          dataTransfer: dropTransfer
        };
        currentEditor.dispatchEvent(new DragEvent("dragenter", dragInit));
        currentEditor.dispatchEvent(new DragEvent("dragover", dragInit));
        const dropHandled = !currentEditor.dispatchEvent(
          new DragEvent("drop", dragInit)
        );
        if (dropHandled) {
          uploaded = await waitFor(() => {
            const liveEditor = resolveEditor();
            return Boolean(
              liveEditor &&
                hasAdditionalResolvedImage(liveEditor, initialResolvedImages)
            );
          }, 30_000);
        }
      }
    }
  }
  if (!uploaded) {
    throw new Error("The platform did not confirm a rich-text image upload.");
  }

  const currentEditor = resolveEditor();
  const remainingToken = currentEditor
    ? findTokenRange(currentEditor, image.token)
    : undefined;
  if (remainingToken) {
    insertion.selection.removeAllRanges();
    insertion.selection.addRange(remainingToken);
    remainingToken.deleteContents();
    if (currentEditor) {
      dispatchEditorInput(currentEditor, "deleteContentBackward");
    }
  }
}

function editableText(editor: HTMLElement): string {
  return isTextArea(editor)
    ? editor.value
    : editor.textContent ?? "";
}

function markdownEditorSurface(editor: HTMLTextAreaElement): HTMLElement {
  return editor.closest<HTMLElement>(".CodeMirror") ?? editor;
}

function markdownEditorText(editor: HTMLTextAreaElement): string {
  const surface = markdownEditorSurface(editor);
  if (surface === editor) {
    return editor.value;
  }
  const rendered = surface.querySelector<HTMLElement>(".CodeMirror-code");
  const lines = rendered
    ? Array.from(
        rendered.querySelectorAll<HTMLElement>(":scope > pre.CodeMirror-line")
      )
    : [];
  if (lines.length > 0) {
    return lines
      .map((line) =>
        (line.textContent ?? "")
          .replaceAll("\u200b", "")
          .replaceAll("\u00a0", " ")
      )
      .join("\n");
  }
  return rendered?.textContent ?? surface.textContent ?? "";
}

function extractHttpUrls(value: string): Set<string> {
  const urls = new Set(value.match(/https?:\/\/[^\s)]+/g) ?? []);
  for (const match of value.matchAll(/!\[[^\]]*\]\((\/[^\s)]+)\)/g)) {
    const relativeUrl = match[1];
    if (!relativeUrl) {
      continue;
    }
    try {
      urls.add(new URL(relativeUrl, location.origin).href);
    } catch {
      // Ignore malformed image targets; upload confirmation remains strict.
    }
  }
  return urls;
}

function httpUrlCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const url of value.match(/https?:\/\/[^\s)]+/g) ?? []) {
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  for (const match of value.matchAll(/!\[[^\]]*\]\((\/[^\s)]+)\)/g)) {
    const relativeUrl = match[1];
    if (!relativeUrl) {
      continue;
    }
    try {
      const url = new URL(relativeUrl, location.origin).href;
      counts.set(url, (counts.get(url) ?? 0) + 1);
    } catch {
      // Ignore malformed image targets; upload confirmation remains strict.
    }
  }
  return counts;
}

function additionalHttpUrl(
  value: string,
  previousCounts: ReadonlyMap<string, number>
): string | undefined {
  const currentCounts = httpUrlCounts(value);
  return Array.from(currentCounts).find(
    ([url, count]) => count > (previousCounts.get(url) ?? 0)
  )?.[0];
}

function markdownEditorVisibleText(editor: HTMLElement): string {
  if (
    editor.matches(
      "pre.editor__inner.markdown-highlighting[contenteditable='true']"
    )
  ) {
    return editor.textContent ?? editor.innerText;
  }
  return isTextArea(editor)
    ? markdownEditorText(editor)
    : editor.innerText || editableText(editor);
}

function assignUploadFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  try {
    input.files = transfer.files;
  } catch {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files
    });
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function uploadThroughMarkdownImageDialog(
  definition: MarkdownImageDialogDefinition,
  file: File,
  hasUploaded: () => boolean
): Promise<boolean> {
  let dialog = queryFirst(definition.dialogSelectors);
  let input = dialog
    ? queryDialogInput(definition.inputSelectors, dialog)
    : undefined;
  if (!dialog || !input) {
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
      const trigger = queryFirst(definition.triggerSelectors);
      if (!trigger) {
        throw new MarkdownImageDialogUnavailableError(
          "The platform image upload action was not found."
        );
      }
      trigger.click();
      opened = await waitFor(() => {
        dialog = queryFirst(definition.dialogSelectors);
        input = dialog
          ? queryDialogInput(definition.inputSelectors, dialog)
          : undefined;
        return Boolean(dialog && input);
      }, 2_000);
      if (!opened) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
      }
    }
    if (!opened || !dialog || !input) {
      throw new MarkdownImageDialogUnavailableError(
        "The platform image upload dialog did not open."
      );
    }
  }

  assignUploadFile(input, file);
  if (await waitFor(hasUploaded, 500)) {
    const close = queryFirst(definition.closeSelectors);
    close?.click();
    await waitFor(
      () => !queryFirst(definition.dialogSelectors),
      close ? 2_000 : 500
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    return true;
  }

  if (definition.confirmText) {
    let confirm = queryExactVisibleText(definition.confirmText, dialog);
    const confirmReady = await waitFor(() => {
      dialog = queryFirst(definition.dialogSelectors) ?? dialog;
      confirm = queryExactVisibleText(definition.confirmText!, dialog);
      return Boolean(
        confirm &&
          (confirm.localName !== "button" ||
            !(confirm as HTMLButtonElement).disabled)
      );
    }, 5_000);
    if (confirmReady && confirm) {
      confirm.click();
    }
  }

  const uploaded = await waitFor(
    hasUploaded,
    definition.uploadTimeoutMs ?? 30_000
  );
  if (!uploaded) {
    queryFirst(definition.closeSelectors)?.click();
  } else {
    const close = queryFirst(definition.closeSelectors);
    close?.click();
    await waitFor(
      () => !queryFirst(definition.dialogSelectors),
      close ? 2_000 : 500
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
  return uploaded;
}

async function uploadThroughMarkdownImageDialogWithRetry(
  definition: MarkdownImageDialogDefinition,
  file: File,
  hasUploaded: () => boolean
): Promise<boolean> {
  const attempts = (definition.retryCount ?? 0) + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, definition.retryDelayMs ?? 1_000);
      });
    }
    if (await uploadThroughMarkdownImageDialog(definition, file, hasUploaded)) {
      return true;
    }
  }
  return false;
}

async function uploadTextareaMarkdownImagesWithDialog(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string,
  definition: MarkdownImageDialogDefinition,
  applyMarkdown: (
    editor: HTMLTextAreaElement,
    markdown: string
  ) => Promise<void>
): Promise<void> {
  const replacements = new Map<string, string>();
  for (const image of images) {
    const editor = resolveEditor();
    if (!editor || !isTextArea(editor)) {
      throw new Error("The Markdown editor was replaced during an image upload.");
    }
    const previousUrls = httpUrlCounts(markdownEditorText(editor));
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    let uploadedUrl: string | undefined;
    const uploadFile = await browserCompatibleUploadFile(image.file);
    const uploaded = await uploadThroughMarkdownImageDialogWithRetry(
      definition,
      uploadFile,
      () => {
        const current = resolveEditor();
        if (!current || !isTextArea(current)) {
          return false;
        }
        uploadedUrl = additionalHttpUrl(
          markdownEditorText(current),
          previousUrls
        );
        return uploadedUrl !== undefined;
      }
    );
    if (!uploaded || !uploadedUrl) {
      throw new Error(
        `The platform did not confirm its image dialog upload for ${uploadFile.name} (${uploadFile.size} bytes).`
      );
    }
    replacements.set(image.token, uploadedUrl);
    if (definition.uploadPacingMs && image !== images.at(-1)) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, definition.uploadPacingMs);
      });
    }
  }

  const editor = resolveEditor();
  if (!editor || !isTextArea(editor)) {
    throw new Error("The Markdown editor disappeared before finalizing images.");
  }
  if (definition.uploadPacingMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, definition.uploadPacingMs);
    });
  }
  let finalizedMarkdown = markdown;
  for (const [token, url] of replacements) {
    const alt = images.find((image) => image.token === token)?.alt;
    finalizedMarkdown = finalizedMarkdown.replaceAll(
      token,
      `![${alt || "crosspost image"}](${url})`
    );
  }
  await applyMarkdown(editor, finalizedMarkdown);
  const finalized = await waitFor(() => {
    const current = resolveEditor();
    if (!current || !isTextArea(current)) {
      return false;
    }
    const text = markdownEditorText(current);
    return (
      !text.includes("CROSSPOST_IMAGE_") &&
      Array.from(replacements.values()).every((url) => text.includes(url))
    );
  }, 5_000);
  if (!finalized) {
    throw new Error("The Markdown editor did not confirm the final image URLs.");
  }
}

function replaceMarkdownImageTokens(
  markdown: string,
  images: EmbeddedImage[],
  replacements: ReadonlyMap<string, string>
): string {
  let finalized = markdown;
  for (const image of images) {
    const url = replacements.get(image.token);
    if (!url) {
      throw new Error("An uploaded image URL was missing during finalization.");
    }
    finalized = finalized.replaceAll(
      image.token,
      `![${image.alt || "crosspost image"}](${url})`
    );
  }
  return finalized;
}

function normalizedMarkdownDocument(value: string): string {
  return value.replace(/\r\n?/g, "\n").trimEnd();
}

function markdownDocumentMatches(editor: HTMLElement, markdown: string): boolean {
  return (
    normalizedMarkdownDocument(markdownEditorVisibleText(editor)) ===
    normalizedMarkdownDocument(markdown)
  );
}

async function setContenteditableMarkdown(
  editor: HTMLElement,
  markdown: string,
  runtime?: DomAdapterRuntime
): Promise<void> {
  const isCsdnEditor = editor.matches(
    "pre.editor__inner.markdown-highlighting[contenteditable='true']"
  );
  if (isCsdnEditor && runtime?.setCsdnMarkdown) {
    const appliedMarkdown = await runtime.setCsdnMarkdown(markdown);
    if (
      appliedMarkdown !== undefined &&
      normalizedMarkdownDocument(appliedMarkdown) ===
        normalizedMarkdownDocument(markdown)
    ) {
      return;
    }
    throw new Error("The CSDN editor did not preserve the source Markdown.");
  }
  if (hasEditorContent(editor)) {
    await clearEditor(() => editor);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  editor.focus();
  selectEditorContents(editor);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  const execCommand = Reflect.get(document, "execCommand") as
    | ((commandId: string, showUi: boolean, value?: string | null) => boolean)
    | undefined;
  if (
    isCsdnEditor &&
    typeof execCommand === "function"
  ) {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let inserted = execCommand.call(
      document,
      "insertText",
      false,
      lines[0] ?? ""
    );
    for (const line of lines.slice(1)) {
      inserted =
        execCommand.call(document, "insertLineBreak", false, null) && inserted;
      if (line) {
        inserted =
          execCommand.call(document, "insertText", false, line) && inserted;
      }
    }
    if (inserted) {
      return;
    }
  }

  if (typeof DataTransfer !== "undefined" && typeof ClipboardEvent !== "undefined") {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", markdown);
    const handled = !editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
    if (handled) {
      return;
    }
  }

  editor.focus();
  selectEditorContents(editor);
  let replaced = false;
  try {
    replaced =
      typeof execCommand === "function" &&
      execCommand.call(
        document,
        "insertHTML",
        false,
        markdown
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll("\n", "<br>")
      );
  } catch {
    replaced = false;
  }
  if (!replaced) {
    editor.textContent = markdown;
    dispatchEditorInput(editor, "insertFromPaste");
  }
}

async function setTextareaMarkdown(
  platform: BrowserPlatform,
  editor: HTMLTextAreaElement,
  markdown: string,
  runtime?: DomAdapterRuntime
): Promise<void> {
  if (platform === "segmentfault" && editor.closest(".CodeMirror")) {
    if (!runtime?.setSegmentFaultMarkdown) {
      throw new Error(
        "SegmentFault's native CodeMirror writer is unavailable. Reload the extension and retry."
      );
    }
    const appliedMarkdown = await runtime.setSegmentFaultMarkdown(markdown);
    if (
      appliedMarkdown !== undefined &&
      normalizedMarkdownDocument(appliedMarkdown) ===
        normalizedMarkdownDocument(markdown)
    ) {
      return;
    }
    throw new Error("SegmentFault did not preserve the source Markdown.");
  }
  setNativeValue(editor, markdown);
}

async function uploadContenteditableMarkdownImagesWithDialog(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string,
  definition: MarkdownImageDialogDefinition,
  runtime?: DomAdapterRuntime
): Promise<void> {
  const replacements = new Map<string, string>();
  for (const image of images) {
    const editor = resolveEditor();
    if (!editor || isTextArea(editor)) {
      throw new Error("The Markdown editor was replaced during an image upload.");
    }
    const previousUrls = httpUrlCounts(markdownEditorVisibleText(editor));
    focusEditor(editor);
    const editorDocument = editor.ownerDocument;
    const selection = editorDocument.defaultView?.getSelection();
    const range = editorDocument.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);

    let uploadedUrl: string | undefined;
    const uploaded = await uploadThroughMarkdownImageDialogWithRetry(
      definition,
      await browserCompatibleUploadFile(image.file),
      () => {
        const current = resolveEditor();
        if (!current || isTextArea(current)) {
          return false;
        }
        uploadedUrl = additionalHttpUrl(
          markdownEditorVisibleText(current),
          previousUrls
        );
        return uploadedUrl !== undefined;
      }
    );
    if (!uploaded || !uploadedUrl) {
      throw new Error("The platform did not confirm its image dialog upload.");
    }
    replacements.set(image.token, uploadedUrl);
  }

  const editor = resolveEditor();
  if (!editor || isTextArea(editor)) {
    throw new Error("The Markdown editor disappeared before finalizing images.");
  }
  const finalized = replaceMarkdownImageTokens(markdown, images, replacements);
  await setContenteditableMarkdown(editor, finalized, runtime);
  const confirmed = await waitFor(() => {
    const current = resolveEditor();
    if (!current || isTextArea(current)) {
      return false;
    }
    const text = markdownEditorVisibleText(current);
    return (
      markdownDocumentMatches(current, finalized) &&
      !text.includes("CROSSPOST_IMAGE_") &&
      Array.from(replacements.values()).every((url) => text.includes(url))
    );
  }, 5_000);
  if (!confirmed) {
    throw new Error("The Markdown editor did not confirm the final image URLs.");
  }
}

async function uploadMarkdownImageAtTokenWithDialog(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage,
  definition: MarkdownImageDialogDefinition
): Promise<void> {
  const tokenAppeared = await waitFor(
    () =>
      markdownEditorVisibleText(resolveEditor() ?? document.body).includes(
        image.token
      ),
    5_000
  );
  const editor = resolveEditor();
  if (!tokenAppeared || !editor || !selectMarkdownToken(editor, image.token)) {
    throw new Error("An image insertion point was lost while filling the Markdown editor.");
  }
  const previousUrls = extractHttpUrls(markdownEditorVisibleText(editor));
  let uploadedUrl: string | undefined;
  const uploaded = await uploadThroughMarkdownImageDialogWithRetry(
    definition,
    await browserCompatibleUploadFile(image.file),
    () => {
      const current = resolveEditor();
      if (!current) {
        return false;
      }
      uploadedUrl = Array.from(
        extractHttpUrls(markdownEditorVisibleText(current))
      ).find((url) => !previousUrls.has(url));
      return uploadedUrl !== undefined;
    }
  );
  if (!uploaded || !uploadedUrl) {
    throw new Error("The platform did not confirm its image dialog upload.");
  }

  const current = resolveEditor();
  if (!current) {
    throw new Error("The Markdown editor disappeared after the image upload.");
  }
  if (markdownEditorVisibleText(current).includes(image.token)) {
    if (!selectMarkdownToken(current, image.token)) {
      throw new Error("The uploaded image could not replace its Markdown marker.");
    }
    const alt = image.alt || "crosspost image";
    const selection = current.ownerDocument.defaultView?.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(
        current.ownerDocument.createTextNode(`![${alt}](${uploadedUrl})`)
      );
      dispatchEditorInput(current, "insertFromPaste");
    }
  }
  const finalized = await waitFor(() => {
    const liveEditor = resolveEditor();
    if (!liveEditor) {
      return false;
    }
    const text = markdownEditorVisibleText(liveEditor);
    return !text.includes(image.token) && text.includes(uploadedUrl!);
  }, 5_000);
  if (!finalized) {
    throw new Error("The uploaded image did not replace its Markdown marker.");
  }
}

async function uploadTextareaMarkdownImages(
  resolveEditor: () => HTMLElement | undefined,
  images: EmbeddedImage[],
  markdown: string,
  applyMarkdown: (
    editor: HTMLTextAreaElement,
    markdown: string
  ) => Promise<void>
): Promise<void> {
  const replacements = new Map<string, string>();
  for (const image of images) {
    const editor = resolveEditor();
    if (!editor || !isTextArea(editor)) {
      throw new Error("The Markdown editor was replaced during an image upload.");
    }
    const previousUrls = extractHttpUrls(markdownEditorText(editor));
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
    const uploadFile = await browserCompatibleUploadFile(image.file);
    const transfer = new DataTransfer();
    transfer.items.add(uploadFile);
    const handled = !editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
    if (!handled) {
      throw new Error("The Markdown editor did not accept an image file paste.");
    }

    let uploadedUrl: string | undefined;
    const uploaded = await waitFor(() => {
      const current = resolveEditor();
      if (!current || !isTextArea(current)) {
        return false;
      }
      uploadedUrl = Array.from(
        extractHttpUrls(markdownEditorText(current))
      ).find((url) => !previousUrls.has(url));
      return uploadedUrl !== undefined;
    }, 30_000);
    if (!uploaded || !uploadedUrl) {
      throw new Error("The platform did not confirm a CodeMirror image upload.");
    }
    replacements.set(image.token, uploadedUrl);
  }

  const editor = resolveEditor();
  if (!editor || !isTextArea(editor)) {
    throw new Error("The Markdown editor disappeared before finalizing images.");
  }
  let finalizedMarkdown = markdown;
  for (const [token, url] of replacements) {
    const alt = images.find((image) => image.token === token)?.alt;
    finalizedMarkdown = finalizedMarkdown.replaceAll(
      token,
      `![${alt || "crosspost image"}](${url})`
    );
  }
  await applyMarkdown(editor, finalizedMarkdown);
  const finalized = await waitFor(() => {
    const current = resolveEditor();
    if (!current || !isTextArea(current)) {
      return false;
    }
    const text = markdownEditorText(current);
    return (
      !text.includes("CROSSPOST_IMAGE_") &&
      Array.from(replacements.values()).every((url) => text.includes(url))
    );
  }, 5_000);
  if (!finalized) {
    throw new Error("The Markdown editor did not confirm the final image URLs.");
  }
}

function selectMarkdownToken(editor: HTMLElement, token: string): boolean {
  if (isTextArea(editor)) {
    const start = editor.value.indexOf(token);
    if (start < 0) {
      return false;
    }
    editor.focus();
    editor.setSelectionRange(start, start + token.length);
    editor.dispatchEvent(new Event("select", { bubbles: true }));
    return true;
  }
  const range = findTokenRange(editor, token);
  const editorDocument = editor.ownerDocument;
  const selection = editorDocument.defaultView?.getSelection();
  if (!range || !selection) {
    return false;
  }
  focusEditor(editor);
  selection.removeAllRanges();
  selection.addRange(range);
  editorDocument.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  return true;
}

async function pasteMarkdownImageAtToken(
  resolveEditor: () => HTMLElement | undefined,
  image: EmbeddedImage
): Promise<void> {
  const tokenAppeared = await waitFor(
    () => editableText(resolveEditor() ?? document.body).includes(image.token),
    5_000
  );
  const editor = resolveEditor();
  if (!tokenAppeared || !editor || !selectMarkdownToken(editor, image.token)) {
    throw new Error("An image insertion point was lost while filling the Markdown editor.");
  }

  const beforePaste = editableText(editor);
  const uploadFile = await browserCompatibleUploadFile(image.file);
  const transfer = new DataTransfer();
  transfer.items.add(uploadFile);
  const handled = !editor.dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer
    })
  );
  if (!handled) {
    throw new Error("The Markdown editor did not accept an image file paste.");
  }

  const uploaded = await waitFor(() => {
    const currentEditor = resolveEditor();
    return Boolean(
      currentEditor &&
      !editableText(currentEditor).includes(image.token) &&
      editableText(currentEditor) !== beforePaste &&
      /https?:\/\//.test(editableText(currentEditor))
    );
  }, 30_000);
  if (!uploaded) {
    throw new Error("The platform did not confirm a Markdown image upload.");
  }
}

function hasEditorContent(editor: HTMLElement): boolean {
  return (
    Boolean(editor.textContent?.trim()) ||
    editor.querySelectorAll("img, table, .FormulaCSR[data-tex]").length > 0
  );
}

function normalizedRichText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, "");
}

function expectedRichTextBlocks(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const selector = "h1, h2, h3, h4, h5, h6, p, li, th, td, blockquote, pre";
  return Array.from(parsed.body.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.querySelector(selector))
    .flatMap((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      for (const media of clone.querySelectorAll(
        "img, svg, video, iframe, canvas"
      )) {
        media.replaceWith(clone.ownerDocument.createTextNode("\0"));
      }
      return (clone.textContent ?? "")
        .split("\0")
        .map((text) => normalizedRichText(text));
    })
    .filter((text) => text.length > 0);
}

function richEditorContainsHtmlText(editor: HTMLElement, html: string): boolean {
  const expected = normalizedRichText(htmlToPlainText(html));
  const actual = normalizedRichText(editor.textContent ?? "");
  if (expected.length === 0) {
    return true;
  }
  if (actual.includes(expected)) {
    return true;
  }
  const blocks = expectedRichTextBlocks(html);
  return blocks.length > 0 && blocks.every((block) => actual.includes(block));
}

function richEditorReadbackMismatch(
  editor: HTMLElement,
  html: string
): string {
  const actual = normalizedRichText(editor.textContent ?? "");
  const missingBlocks = expectedRichTextBlocks(html).filter(
    (block) => !actual.includes(block)
  );
  const missingSummary = missingBlocks
    .slice(0, 4)
    .map((block) => JSON.stringify(block.slice(0, 80)))
    .join(", ");
  return `The rich-text editor did not preserve the replacement article body (actualLength=${actual.length}; missingBlocks=${
    missingSummary || "none"
  }).`;
}

async function clearEditor(
  resolveEditor: () => HTMLElement | undefined
): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const editor = resolveEditor();
    if (!editor) {
      throw new Error("The visible editor disappeared before it could be updated.");
    }
    if (!hasEditorContent(editor)) {
      return editor;
    }
    focusEditor(editor);
    selectEditorContents(editor);
    const selection = editor.ownerDocument.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0 || !selectionIsInside(editor)) {
      throw new Error(
        "The existing editor content could not be selected safely; no replacement was inserted."
      );
    }
    selection.getRangeAt(0).deleteContents();
    dispatchEditorInput(editor, "deleteContentBackward");
    const cleared = await waitFor(() => {
      const currentEditor = resolveEditor();
      return Boolean(currentEditor && !hasEditorContent(currentEditor));
    }, 750);
    const currentEditor = resolveEditor();
    if (cleared && currentEditor && !hasEditorContent(currentEditor)) {
      return currentEditor;
    }
  }
  throw new Error(
    "The existing editor content could not be cleared safely; no replacement was inserted."
  );
}

async function insertIntoEditor(
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

function hasSaveEvidence(definition: PlatformDomDefinition): boolean {
  for (const selector of definition.saveEvidenceSelectors) {
    for (const element of queryAllDeep<HTMLElement>(selector)) {
      if (
        element.getClientRects().length > 0 &&
        definition.saveEvidenceText.test(element.textContent ?? "")
      ) {
        return true;
      }
    }
  }
  return false;
}

function saveEvidenceSignature(definition: PlatformDomDefinition): string {
  return definition.saveEvidenceSelectors
    .flatMap((selector) =>
      Array.from(
        queryAllDeep<HTMLElement>(selector),
        (element) =>
          [
            element.textContent?.trim() ?? "",
            element.className,
            element.getAttribute("aria-label") ?? "",
            element.dataset.state ?? ""
          ].join("\u0000")
      )
    )
    .join("\n");
}

async function waitForSaveEvidence(
  definition: PlatformDomDefinition,
  initialSignature: string,
  timeoutMs = 20_000
): Promise<boolean> {
  return new Promise((resolve) => {
    let sawStatusChange = saveEvidenceSignature(definition) !== initialSignature;
    if (sawStatusChange && hasSaveEvidence(definition)) {
      resolve(true);
      return;
    }
    const deadline = window.setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (saveEvidenceSignature(definition) !== initialSignature) {
        sawStatusChange = true;
      }
      if (!sawStatusChange || !hasSaveEvidence(definition)) {
        return;
      }
      window.clearTimeout(deadline);
      observer.disconnect();
      resolve(true);
    });
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });
  });
}

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
