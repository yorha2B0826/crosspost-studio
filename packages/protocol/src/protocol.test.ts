import { describe, expect, it } from "vitest";

import {
  BROWSER_RUNTIME_REVISION,
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
      "jianshu",
      "segmentfault",
      "51cto",
      "baijiahao",
      "toutiao",
      "bilibili",
      "tencentcloud"
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
    expect(() => parseBridgeMessage("not json")).toThrow();
    expect(() =>
      parseBridgeMessage(
        JSON.stringify({
          nonce: generateSecretHex(),
          protocolVersion: PROTOCOL_VERSION + 1,
          type: "pair"
        })
      )
    ).toThrow();
  });

  it("accepts a runtime revision and preserves pre-revision capability advertisements", () => {
    expect(
      parseBridgeMessage(
        JSON.stringify({
          extensionVersion: "1.0.1",
          platforms: ["zhihu"],
          protocolVersion: PROTOCOL_VERSION,
          runtimeRevision: BROWSER_RUNTIME_REVISION,
          type: "capabilities"
        })
      )
    ).toMatchObject({
      runtimeRevision: BROWSER_RUNTIME_REVISION,
      type: "capabilities"
    });

    const legacyCapabilities = parseBridgeMessage(
      JSON.stringify({
        extensionVersion: "1.0.1",
        platforms: ["zhihu"],
        protocolVersion: PROTOCOL_VERSION,
        type: "capabilities"
      })
    );
    expect(legacyCapabilities).toMatchObject({ type: "capabilities" });
    expect(legacyCapabilities).not.toHaveProperty("runtimeRevision");
  });

  it("redacts credential-shaped values before logging", () => {
    const redacted = redactSensitiveText(
      'appSecret="topsecret" assetToken: abc123 Authorization: Bearer token.value ' +
        "https://api.weixin.qq.com/x?access_token=leak&x=1"
    );

    expect(redacted).not.toMatch(/topsecret|abc123|token\.value|leak/);
    expect(redacted.match(/\[REDACTED]/g)).toHaveLength(4);
  });

  it("redacts newly covered credential key shapes", () => {
    const redacted = redactSensitiveText(
      'secret=abc client_secret: x password=hunter2 apikey=zzz "token": "yyy"'
    );

    expect(redacted).not.toMatch(/abc|hunter2|zzz|yyy/);
    expect(redacted).toContain("secret=");
    expect(redacted).toContain("client_secret:");
    expect(redacted).toContain("password=");
    expect(redacted.match(/\[REDACTED]/g)).toHaveLength(5);
  });
});
