import { queryAllDeep, queryFirst } from "./query";

export function resolveBaijiahaoEditor(title?: HTMLElement): HTMLElement | undefined {
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

export function summarizeBaijiahaoTitleRegion(): string {
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

export function summarizeBaijiahaoEditorCandidates(title?: HTMLElement): string {
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
