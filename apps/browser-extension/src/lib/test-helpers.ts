import { vi } from "vitest";

/**
 * Shared DataTransfer/ClipboardEvent/DragEvent stubs for jsdom paste tests.
 * jsdom implements none of these constructors, so every test that dispatches
 * synthetic paste or drop events stubs them with these classes.
 */
export class TestDataTransfer {
  readonly files: File[] = [];
  readonly items = {
    add: (file: File): File => {
      this.files.push(file);
      return file;
    }
  };
  private readonly values = new Map<string, string>();

  getData(type: string): string {
    return this.values.get(type) ?? "";
  }

  setData(type: string, value: string): void {
    this.values.set(type, value);
  }
}

export class TestClipboardEvent extends Event {
  readonly clipboardData: TestDataTransfer;

  constructor(
    type: string,
    init: EventInit & { clipboardData: TestDataTransfer }
  ) {
    super(type, init);
    this.clipboardData = init.clipboardData;
  }
}

export class TestDragEvent extends Event {
  readonly dataTransfer: TestDataTransfer | null;

  constructor(
    type: string,
    init: EventInit & { dataTransfer?: TestDataTransfer | null }
  ) {
    super(type, init);
    this.dataTransfer = init.dataTransfer ?? null;
  }
}

export function stubClipboardGlobals(): void {
  vi.stubGlobal("DataTransfer", TestDataTransfer);
  vi.stubGlobal("ClipboardEvent", TestClipboardEvent);
  vi.stubGlobal("DragEvent", TestDragEvent);
}
