import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

import type { FormulaRasterizerResult } from "./types.js";

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

export function renderMathSvg(latex: string, display: boolean): string {
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
  const markupWithColor = match[0].replace(/currentColor/g, "#1f2328");
  const openingTag = markupWithColor.slice(0, markupWithColor.indexOf(">"));
  if (/\bxmlns=/.test(openingTag)) {
    return markupWithColor;
  }
  return markupWithColor.replace(
    "<svg",
    '<svg xmlns="http://www.w3.org/2000/svg"'
  );
}

export async function browserSvgToPng(
  svgMarkup: string,
  display: boolean
): Promise<FormulaRasterizerResult> {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The browser could not decode the SVG image."));
    });
    image.src = url;
    await loaded;

    const scale = display ? 2 : 3;
    const naturalWidth = Math.max(1, image.naturalWidth || image.width);
    const naturalHeight = Math.max(1, image.naturalHeight || image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(naturalWidth * scale);
    canvas.height = Math.ceil(naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D is unavailable.");
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, naturalWidth, naturalHeight);

    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("The browser could not encode the SVG image as PNG."));
        }
      }, "image/png");
    });
    return {
      bytes: new Uint8Array(await png.arrayBuffer()),
      height: naturalHeight,
      mimeType: "image/png",
      width: naturalWidth
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
