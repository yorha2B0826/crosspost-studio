import type { BrowserPlatform } from "../messages";
import type { PlatformDomDefinition } from "./types";

export const ZHIHU_IMPORT_FAILURE_IMAGE =
  "v2-4f89913ab376925632be5823a038f938";
export const BAIJIAHAO_ADAPTER_REVISION = "feeditor-ueditor-v7";
export const BAIJIAHAO_EXPLICIT_TITLE_SELECTORS = [
  "textarea[placeholder^='请输入标题']",
  "input[placeholder^='请输入标题']",
  "[contenteditable]:not([contenteditable='false'])[data-placeholder*='请输入标题']",
  "[contenteditable]:not([contenteditable='false'])[aria-label*='标题']",
  ".input-box > [contenteditable]:not([contenteditable='false'])",
  ".input-box [contenteditable]:not([contenteditable='false'])",
  "[class*='placeholder'] + [contenteditable]:not([contenteditable='false'])"
];
export const BAIJIAHAO_FEEDITOR_TITLE_SELECTORS = [
  "[class*='FeEditorApp-'][class*='-container'] [class*='FeEditorApp-'][class*='-editor'][contenteditable]:not([contenteditable='false'])",
  "[class*='FeEditorApp-'][class*='-editor'][contenteditable]:not([contenteditable='false'])"
];

export const DEFINITIONS: Record<BrowserPlatform, PlatformDomDefinition> = {
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
