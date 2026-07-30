// @vitest-environment jsdom

import {
  generateSecretHex,
  hmacSha256Hex,
  parseBridgeMessage,
  PROTOCOL_VERSION
} from "@crosspost/protocol";
import type { PublicationAsset } from "@crosspost/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { RawData } from "ws";

import { BridgeServer } from "./bridge-server";

let server: BridgeServer | undefined;
let client: WebSocket | undefined;

function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("message", (value: RawData) => {
      const bytes = Array.isArray(value)
        ? Buffer.concat(value)
        : value instanceof ArrayBuffer
          ? Buffer.from(value)
          : Buffer.from(value);
      resolve(bytes.toString("utf8"));
    });
    socket.once("error", reject);
  });
}

afterEach(async () => {
  client?.close();
  if (server) {
    await server.stop();
  }
  client = undefined;
  server = undefined;
});

describe("localhost bridge", () => {
  it("serves health and authenticates an extension-origin HMAC challenge", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    await expect(health.json()).resolves.toEqual({
      protocolVersion: PROTOCOL_VERSION,
      status: "ok"
    });

    client = new WebSocket(`ws://127.0.0.1:${port}/v1/bridge`, {
      origin: "chrome-extension://crosspost-test"
    });
    const challenge = parseBridgeMessage(await nextMessage(client));
    expect(challenge.type).toBe("pair");
    if (challenge.type !== "pair") {
      throw new Error("Expected a pair challenge.");
    }
    client.send(
      JSON.stringify({
        proof: await hmacSha256Hex(secret, challenge.nonce),
        protocolVersion: PROTOCOL_VERSION,
        type: "pair-response"
      })
    );

    const result = parseBridgeMessage(await nextMessage(client));
    expect(result).toMatchObject({
      accepted: true,
      type: "pair-result"
    });
    await vi.waitFor(() => {
      expect(server?.hasAuthenticatedClient()).toBe(true);
    });

    const assetId = "a".repeat(64);
    const asset: PublicationAsset = {
      alt: "formula",
      bytes: new Uint8Array([1, 2, 3]),
      height: 20,
      id: assetId,
      kind: "formula-inline",
      mimeType: "image/png",
      name: "formula.png",
      width: 40
    };
    const completion = server.enqueue({
      artifact: {
        assets: [{ ...asset, bytes: undefined }].map(
          ({ bytes: _bytes, ...descriptor }) => descriptor
        ),
        contentHash: "b".repeat(64),
        diagnostics: [],
        html: `<img src="crosspost-asset://${assetId}">`,
        markdown: `![formula](crosspost-asset://${assetId})`,
        metadata: {
          tags: [],
          title: "Bridge integration"
        },
        platform: "zhihu"
      },
      assets: new Map([[assetId, asset]]),
      target: "zhihu"
    });
    const queued = parseBridgeMessage(await nextMessage(client));
    expect(queued.type).toBe("enqueue-job");
    if (queued.type !== "enqueue-job") {
      throw new Error("Expected an enqueue job.");
    }

    const resourceUrl = `${queued.job.assetBaseUrl}/${assetId}`;
    await expect(fetch(resourceUrl)).resolves.toMatchObject({ status: 401 });
    const resource = await fetch(resourceUrl, {
      headers: {
        Authorization: `Bearer ${queued.job.assetToken}`
      }
    });
    expect(resource.headers.get("cache-control")).toBe("no-store");
    expect(Array.from(new Uint8Array(await resource.arrayBuffer()))).toEqual([1, 2, 3]);

    const binding = {
      draftUrl: "https://zhuanlan.zhihu.com/p/bridge-test",
      platform: "zhihu" as const,
      sourceHash: queued.job.artifact.contentHash,
      updatedAt: new Date().toISOString()
    };
    client.send(
      JSON.stringify({
        binding,
        jobId: queued.job.id,
        message: "saved",
        protocolVersion: PROTOCOL_VERSION,
        state: "draft-saved",
        type: "job-result"
      })
    );
    await expect(completion).resolves.toEqual(binding);
  });
});
