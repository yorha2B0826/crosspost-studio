// @vitest-environment jsdom

import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderMathSvg } from "./math";
import { browserSvgToPng } from "./rasterize";

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser formula rasterizer", () => {
  it("emits a valid SVG with exactly one namespace declaration", () => {
    const svg = renderMathSvg("E=mc^2", false);

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.match(/\bxmlns=/g)).toHaveLength(1);
  });

  it("preserves currentColor for formulas embedded in adaptive HTML", () => {
    const svg = renderMathSvg("E=mc^2", false, "inherit");

    expect(svg).toContain("currentColor");
    expect(svg).not.toContain("#1f2328");
  });

  it("uses a transparent high-density canvas while reporting CSS dimensions", async () => {
    const scale = vi.fn();
    const drawImage = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => ({ drawImage, scale })
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      configurable: true,
      value: (callback: BlobCallback) => {
        callback(
          new NodeBlob([PNG_HEADER], { type: "image/png" }) as unknown as Blob
        );
      }
    });
    class FakeImage {
      decoding = "auto";
      height = 20;
      naturalHeight = 20;
      naturalWidth = 40;
      ownerDocument = document;
      onerror: OnErrorEventHandler | null = null;
      onload: (() => void) | null = null;
      width = 40;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:formula"),
      revokeObjectURL: vi.fn()
    });

    const result = await browserSvgToPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>',
      false
    );

    expect(result).toMatchObject({
      height: 20,
      mimeType: "image/png",
      width: 40
    });
    expect(Array.from(result.bytes)).toEqual(Array.from(PNG_HEADER));
    expect(scale).toHaveBeenCalledWith(3, 3);
    expect(drawImage).toHaveBeenCalled();
  });
});
