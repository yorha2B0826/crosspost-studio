import { describe, expect, it } from "vitest";

import { mergeExtensionConfiguration } from "./configuration";

describe("extension configuration", () => {
  it("keeps the saved pairing key when only the port changes", () => {
    expect(
      mergeExtensionConfiguration(
        { pairingKey: "saved-key", port: 27_124 },
        { port: 28_000 }
      )
    ).toEqual({
      pairingKey: "saved-key",
      port: 28_000
    });
  });

  it("replaces the pairing key when a new one is supplied", () => {
    expect(
      mergeExtensionConfiguration(
        { pairingKey: "old-key", port: 27_124 },
        { pairingKey: "new-key", port: 27_124 }
      )
    ).toEqual({
      pairingKey: "new-key",
      port: 27_124
    });
  });
});
