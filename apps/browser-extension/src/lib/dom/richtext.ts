export function htmlToPlainText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

export function normalizedRichText(value: string): string {
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
        "img, svg, video, iframe, canvas, [data-tex], .FormulaCSR, .ztext-math"
      )) {
        media.replaceWith(clone.ownerDocument.createTextNode("\0"));
      }
      return (clone.textContent ?? "")
        .split("\0")
        .map((text) => normalizedRichText(text));
    })
    .filter((text) => text.length > 0);
}

export function richEditorContainsHtmlText(editor: HTMLElement, html: string): boolean {
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

function stringCounts(values: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function richEditorContainsFormulaData(
  editor: HTMLElement,
  html: string
): boolean {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const expected = stringCounts(
    Array.from(parsed.body.querySelectorAll<HTMLElement>("[data-tex]"))
      .map((formula) => formula.dataset.tex ?? "")
      .filter((latex) => latex.length > 0)
  );
  if (expected.size === 0) {
    return true;
  }
  const actual = stringCounts(
    Array.from(editor.querySelectorAll<HTMLElement>("[data-tex]"))
      .map((formula) => formula.dataset.tex ?? "")
      .filter((latex) => latex.length > 0)
  );
  return Array.from(expected).every(
    ([latex, count]) => (actual.get(latex) ?? 0) >= count
  );
}

export function richEditorReadbackMismatch(
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
