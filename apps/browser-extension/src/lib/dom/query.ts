export function queryAllDeep<T extends Element>(
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

export function queryFirst(
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

export function queryDialogInput(
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

export function queryExactVisibleText(
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

export function queryVisibleTextPrefix(value: string): HTMLElement | undefined {
  return queryAllDeep<HTMLElement>("*").find(
    (element) =>
      element.childElementCount === 0 &&
      element.textContent?.trim().startsWith(value) &&
      element.getClientRects().length > 0
  );
}

export function queryEditableNearVisibleText(
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

export function summarizeVisibleEditors(): string {
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

export async function waitFor(
  predicate: () => boolean,
  timeoutMs: number
): Promise<boolean> {
  if (predicate()) {
    return true;
  }
  const { promise, resolve } = Promise.withResolvers<boolean>();
  let finished = false;
  let evaluationPending = false;
  const finish = (result: boolean): void => {
    finished = true;
    window.clearInterval(poll);
    window.clearTimeout(timeout);
    observer.disconnect();
    resolve(result);
  };
  // Coalesce mutation bursts into one microtask so a stream of mutations
  // costs one full-tree predicate evaluation instead of one per record.
  const scheduleEvaluation = (): void => {
    if (finished || evaluationPending) {
      return;
    }
    evaluationPending = true;
    queueMicrotask(() => {
      evaluationPending = false;
      if (!finished && predicate()) {
        finish(true);
      }
    });
  };
  const observer = new MutationObserver(scheduleEvaluation);
  const timeout = window.setTimeout(() => {
    finish(predicate());
  }, timeoutMs);
  // The observer covers childList/attributes/characterData; the interval is
  // only a relaxed safety net for changes MutationObserver cannot see.
  const poll = window.setInterval(scheduleEvaluation, 250);
  observer.observe(document.body, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  });
  return promise;
}
