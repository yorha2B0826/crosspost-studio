import { describe, expect, it } from "vitest";

import {
  BROWSER_PLATFORM_IDS,
  generateSecretHex,
  hmacSha256Hex,
  parseBridgeMessage,
  PROTOCOL_VERSION,
  redactSensitiveText,
  verifyHmacSha256Hex
} from "./index.js";

describe("bridge protocol", () => {
  it("advertises every browser platform without including WeChat", () => {
    expect(BROWSER_PLATFORM_IDS).toEqual([
      "zhihu",
      "juejin",
      "csdn",
      "oschina",
      "cnblogs",
      "jianshu"
    ]);
    expect(BROWSER_PLATFORM_IDS).not.toContain("wechat");
  });

  it("authenticates a challenge without transmitting the secret", async () => {
    const secret = generateSecretHex();
    const nonce = generateSecretHex();
    const proof = await hmacSha256Hex(secret, nonce);

    await expect(verifyHmacSha256Hex(secret, nonce, proof)).resolves.toBe(true);
    await expect(verifyHmacSha256Hex(generateSecretHex(), nonce, proof)).resolves.toBe(false);
  });

  it("parses supported messages and rejects unknown shapes", () => {
    expect(
      parseBridgeMessage(
        JSON.stringify({
          nonce: generateSecretHex(),
          protocolVersion: PROTOCOL_VERSION,
          type: "pair"
        })
      ).type
    ).toBe("pair");

    expect(() =>
      parseBridgeMessage(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: "publish-now" }))
    ).toThrow();
    expect(() =>
      parseBridgeMessage("x".repeat(512 * 1024 + 1))
    ).toThrow("maximum size");
  });

  it("redacts credential-shaped values before logging", () => {
    const redacted = redactSensitiveText(
      'appSecret="topsecret" assetToken: abc123 Authorization: Bearer token.value ' +
        "https://api.weixin.qq.com/x?access_token=leak&x=1"
    );

    expect(redacted).not.toMatch(/topsecret|abc123|token\.value|leak/);
    expect(redacted.match(/\[REDACTED]/g)).toHaveLength(4);
  });
});
