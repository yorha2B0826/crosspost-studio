import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages
});
const svg = new SVG({
  fontCache: "none"
});
const mathDocument = mathjax.document("", {
  InputJax: tex,
  OutputJax: svg
});

export function renderMathSvg(
  latex: string,
  display: boolean,
  color: "fixed" | "inherit" = "fixed"
): string {
  const converted: unknown = mathDocument.convert(latex, {
    display,
    em: 16,
    ex: 8,
    containerWidth: 1_200
  });
  if (!(converted instanceof LiteElement)) {
    throw new Error("MathJax returned an unexpected document node.");
  }
  const markup = adaptor.outerHTML(converted);
  const match = markup.match(/<svg[\s\S]*<\/svg>/);
  if (!match) {
    throw new Error("MathJax did not produce an SVG element.");
  }
  // Invalid LaTeX must not silently produce a red error SVG. Undefined
  // control sequences render as red-filled text without an merror node,
  // so the red fallback is part of the check.
  if (/data-mjx-error|data-mml-node="merror"|fill="red"|stroke="red"/.test(match[0])) {
    throw new Error("MathJax could not render the formula.");
  }
  const markupWithColor =
    color === "inherit" ? match[0] : match[0].replace(/currentColor/g, "#1f2328");
  const openingTag = markupWithColor.slice(0, markupWithColor.indexOf(">"));
  if (/\bxmlns=/.test(openingTag)) {
    return markupWithColor;
  }
  return markupWithColor.replace(
    "<svg",
    '<svg xmlns="http://www.w3.org/2000/svg"'
  );
}
