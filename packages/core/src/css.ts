import postcss from "postcss";

const ALLOWED_PROPERTIES = new Set([
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-style",
  "border-width",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "overflow",
  "overflow-wrap",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-indent",
  "vertical-align",
  "white-space",
  "width",
  "word-break"
]);

export function sanitizeCustomCss(css: string): string {
  const root = postcss.parse(css);
  root.walkAtRules((rule) => {
    rule.remove();
  });
  root.walkDecls((declaration) => {
    const value = declaration.value.toLowerCase();
    if (
      !ALLOWED_PROPERTIES.has(declaration.prop.toLowerCase()) ||
      value.includes("url(") ||
      value.includes("expression(") ||
      value.includes("javascript:")
    ) {
      declaration.remove();
    }
  });
  root.walkRules((rule) => {
    const scoped = rule.selectors.every((selector) => {
      const trimmed = selector.trim();
      const rootSelector = "#crosspost-root";
      return (
        trimmed === rootSelector ||
        [" ", ">", "+", "~", ":", "[", ".", "#"].some((separator) =>
          trimmed.startsWith(`${rootSelector}${separator}`)
        )
      );
    });
    if (!scoped) {
      rule.remove();
    }
  });
  return root.toString();
}
