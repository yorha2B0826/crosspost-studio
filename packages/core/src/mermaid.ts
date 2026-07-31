import { sha256Hex } from "./hash.js";
import type { ResolvedAsset } from "./types.js";

const MAX_MERMAID_SOURCE_CHARS = 50_000;
let renderQueue: Promise<void> = Promise.resolve();

export interface MermaidEngine {
  initialize(config: Record<string, unknown>): void;
  parse(source: string): Promise<unknown>;
  render(id: string, source: string): Promise<{ svg: string } | string>;
}

export type MermaidEngineLoader = () => Promise<MermaidEngine>;

function parseDimension(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function sanitizeSvg(svgMarkup: string): {
  height?: number;
  svg: string;
  width?: number;
} {
  const documentNode = new DOMParser().parseFromString(
    svgMarkup,
    "image/svg+xml"
  );
  if (documentNode.querySelector("parsererror")) {
    throw new Error("Mermaid produced invalid SVG markup.");
  }
  const svg = documentNode.documentElement;
  if (svg.localName !== "svg") {
    throw new Error("Mermaid did not produce an SVG element.");
  }

  for (const element of Array.from(
    svg.querySelectorAll("script, foreignObject, iframe, object, embed")
  )) {
    element.remove();
  }
  for (const style of Array.from(svg.querySelectorAll("style"))) {
    if (
      /@import|expression\s*\(|javascript:|url\s*\(\s*(?!['"]?#)/i.test(
        style.textContent ?? ""
      )
    ) {
      throw new Error("Mermaid produced SVG styles with an external resource.");
    }
  }
  for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "xlink:href") &&
          value !== "" &&
          !value.startsWith("#")) ||
        (name === "style" &&
          /url\s*\(\s*(?!['"]?#)/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth =
    viewBox?.length === 4 && Number.isFinite(viewBox[2]) && (viewBox[2] ?? 0) > 0
      ? viewBox[2]
      : undefined;
  const viewBoxHeight =
    viewBox?.length === 4 && Number.isFinite(viewBox[3]) && (viewBox[3] ?? 0) > 0
      ? viewBox[3]
      : undefined;
  const width = viewBoxWidth ?? parseDimension(svg.getAttribute("width"));
  const height = viewBoxHeight ?? parseDimension(svg.getAttribute("height"));
  if (width && height && !svg.hasAttribute("viewBox")) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  svg.setAttribute("role", "img");

  return {
    height,
    svg: new XMLSerializer().serializeToString(svg),
    width
  };
}

async function renderMermaidSvgInternal(
  source: string,
  loadEngine: MermaidEngineLoader,
  configureEngine: boolean
): Promise<ResolvedAsset> {
  if (!source.trim()) {
    throw new Error("Mermaid code block is empty.");
  }
  if (source.length > MAX_MERMAID_SOURCE_CHARS) {
    throw new Error(
      `Mermaid code exceeds the ${MAX_MERMAID_SOURCE_CHARS.toLocaleString()} character limit.`
    );
  }

  const digest = await sha256Hex(source);
  const mermaid = await loadEngine();
  if (configureEngine) {
    mermaid.initialize({
      deterministicIDSeed: digest,
      deterministicIds: true,
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true
      },
      maxTextSize: MAX_MERMAID_SOURCE_CHARS,
      securityLevel: "strict",
      startOnLoad: false,
      theme: "base"
    });
  }
  await mermaid.parse(source);
  const renderId = `crosspost-mermaid-${digest.slice(0, 16)}`;
  try {
    const rendered = await mermaid.render(renderId, source);
    const sanitized = sanitizeSvg(
      typeof rendered === "string" ? rendered : rendered.svg
    );
    return {
      bytes: new TextEncoder().encode(sanitized.svg),
      height: sanitized.height,
      mimeType: "image/svg+xml",
      name: `mermaid-${digest.slice(0, 12)}.svg`,
      width: sanitized.width
    };
  } finally {
    document.getElementById(renderId)?.remove();
    document.getElementById(`d${renderId}`)?.remove();
  }
}

export function renderMermaidSvg(
  source: string,
  loadEngine: MermaidEngineLoader,
  configureEngine = false
): Promise<ResolvedAsset> {
  const task = renderQueue.then(() =>
    renderMermaidSvgInternal(source, loadEngine, configureEngine)
  );
  renderQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}
