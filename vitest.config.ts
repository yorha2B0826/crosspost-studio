import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(
        new URL("./apps/obsidian-plugin/src/obsidian-test-stub.ts", import.meta.url)
      )
    }
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    },
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    restoreMocks: true
  }
});
