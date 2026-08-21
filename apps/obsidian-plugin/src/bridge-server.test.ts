// @vitest-environment jsdom

import { request as httpRequest } from "node:http";

import {
  BROWSER_RUNTIME_REVISION,
  BROWSER_PLATFORM_IDS,
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

async function pairClient(port: number, secret: string): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/bridge`, {
    origin: "chrome-extension://crosspost-test"
  });
  const challenge = parseBridgeMessage(await nextMessage(socket));
  if (challenge.type !== "pair") {
    throw new Error("Expected a pair challenge.");
  }
  socket.send(
    JSON.stringify({
      proof: await hmacSha256Hex(secret, challenge.nonce),
      protocolVersion: PROTOCOL_VERSION,
      type: "pair-response"
    })
  );
  const result = parseBridgeMessage(await nextMessage(socket));
  if (result.type !== "pair-result" || !result.accepted) {
    throw new Error("Expected an accepted pair result.");
  }
  socket.send(
    JSON.stringify({
      extensionVersion: "1.0.1",
      platforms: [...BROWSER_PLATFORM_IDS],
      protocolVersion: PROTOCOL_VERSION,
      runtimeRevision: BROWSER_RUNTIME_REVISION,
      type: "capabilities"
    })
  );
  await vi.waitFor(() => {
    expect(server?.getRuntimeStatus().compatible).toBe(true);
  });
  return socket;
}

function fetchWithHost(
  port: number,
  path: string,
  host: string
): Promise<{ statusCode: number | undefined }> {
  return new Promise<{ statusCode: number | undefined }>((resolve, reject) => {
    const request = httpRequest(
      { headers: { host }, host: "127.0.0.1", path, port },
      (response) => {
        response.resume();
        resolve({ statusCode: response.statusCode });
      }
    );
    request.on("error", reject);
    request.end();
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
    client.send(
      JSON.stringify({
        extensionVersion: "1.0.1",
        platforms: [...BROWSER_PLATFORM_IDS],
        protocolVersion: PROTOCOL_VERSION,
        runtimeRevision: BROWSER_RUNTIME_REVISION,
        type: "capabilities"
      })
    );
    await vi.waitFor(() => {
      expect(server?.getRuntimeStatus()).toMatchObject({
        compatible: true,
        connected: true,
        extensionVersion: "1.0.1",
        runtimeRevision: BROWSER_RUNTIME_REVISION
      });
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

  it("captures capabilities sent immediately after pairing succeeds", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();
    client = new WebSocket(`ws://127.0.0.1:${port}/v1/bridge`, {
      origin: "chrome-extension://crosspost-test"
    });
    client.on("message", (raw: RawData) => {
      void (async () => {
        const message = parseBridgeMessage(
          Array.isArray(raw)
            ? Buffer.concat(raw).toString("utf8")
            : Buffer.from(raw as ArrayBuffer).toString("utf8")
        );
        if (message.type === "pair") {
          client?.send(
            JSON.stringify({
              proof: await hmacSha256Hex(secret, message.nonce),
              protocolVersion: PROTOCOL_VERSION,
              type: "pair-response"
            })
          );
        } else if (message.type === "pair-result" && message.accepted) {
          client?.send(
            JSON.stringify({
              extensionVersion: "1.0.1",
              platforms: [...BROWSER_PLATFORM_IDS],
              protocolVersion: PROTOCOL_VERSION,
              runtimeRevision: BROWSER_RUNTIME_REVISION,
              type: "capabilities"
            })
          );
        }
      })();
    });

    await vi.waitFor(() => {
      expect(server?.getRuntimeStatus()).toMatchObject({
        compatible: true,
        connected: true,
        extensionVersion: "1.0.1",
        runtimeRevision: BROWSER_RUNTIME_REVISION
      });
    });
  });

  it("rejects HTTP requests whose Host header is not the loopback endpoint", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();

    await expect(
      fetchWithHost(port, "/health", "evil.example")
    ).resolves.toMatchObject({ statusCode: 403 });
    await expect(
      fetchWithHost(port, "/health", `127.0.0.1:${port}`)
    ).resolves.toMatchObject({ statusCode: 200 });
  });

  it("rejects jobs while the connected extension runtime is stale", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();
    client = new WebSocket(`ws://127.0.0.1:${port}/v1/bridge`, {
      origin: "chrome-extension://crosspost-test"
    });
    const challenge = parseBridgeMessage(await nextMessage(client));
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
    expect(result).toMatchObject({ accepted: true, type: "pair-result" });
    client.send(
      JSON.stringify({
        extensionVersion: "1.0.1",
        platforms: [...BROWSER_PLATFORM_IDS],
        protocolVersion: PROTOCOL_VERSION,
        runtimeRevision: "stale-runtime",
        type: "capabilities"
      })
    );
    await vi.waitFor(() => {
      expect(server?.getRuntimeStatus()).toMatchObject({
        compatible: false,
        connected: true,
        runtimeRevision: "stale-runtime"
      });
    });

    await expect(
      server.enqueue({
        artifact: {
          assets: [],
          contentHash: "b".repeat(64),
          diagnostics: [],
          html: "<p>stale runtime guard</p>",
          markdown: "stale runtime guard",
          metadata: { tags: [], title: "Stale runtime guard" },
          platform: "zhihu"
        },
        assets: new Map(),
        target: "zhihu"
      })
    ).rejects.toThrow("older runtime");
  });

  it("allows the previous runtime for platforms unchanged by the latest adapter", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();
    client = new WebSocket(`ws://127.0.0.1:${port}/v1/bridge`, {
      origin: "chrome-extension://crosspost-test"
    });
    const challenge = parseBridgeMessage(await nextMessage(client));
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
    const paired = parseBridgeMessage(await nextMessage(client));
    expect(paired).toMatchObject({ accepted: true, type: "pair-result" });
    client.send(
      JSON.stringify({
        extensionVersion: "1.0.1",
        platforms: [...BROWSER_PLATFORM_IDS],
        protocolVersion: PROTOCOL_VERSION,
        runtimeRevision: "2026-08-21-platform-adapters-5",
        type: "capabilities"
      })
    );
    await vi.waitFor(() => {
      expect(server?.getRuntimeStatus()).toMatchObject({
        compatible: false,
        connected: true,
        runtimeRevision: "2026-08-21-platform-adapters-5"
      });
    });

    const completion = server.enqueue({
      artifact: {
        assets: [],
        contentHash: "b".repeat(64),
        diagnostics: [],
        html: "<p>legacy-compatible runtime</p>",
        markdown: "legacy-compatible runtime",
        metadata: { tags: [], title: "Legacy-compatible runtime" },
        platform: "jianshu"
      },
      assets: new Map(),
      target: "jianshu"
    });
    const queued = parseBridgeMessage(await nextMessage(client));
    if (queued.type !== "enqueue-job") {
      throw new Error("Expected an enqueue job.");
    }
    const binding = {
      draftUrl: "https://www.jianshu.com/writer#/notes/legacy-compatible",
      platform: "jianshu" as const,
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

    await expect(
      server.enqueue({
        artifact: {
          assets: [],
          contentHash: "c".repeat(64),
          diagnostics: [],
          html: "<p>requires latest runtime</p>",
          markdown: "requires latest runtime",
          metadata: { tags: [], title: "Requires latest runtime" },
          platform: "juejin"
        },
        assets: new Map(),
        target: "juejin"
      })
    ).rejects.toThrow("older runtime for juejin");
  });

  it("restricts unversioned extension capabilities to legacy-compatible platforms", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();
    client = await pairClient(port, secret);
    client.send(
      JSON.stringify({
        extensionVersion: "1.0.0",
        platforms: [...BROWSER_PLATFORM_IDS],
        protocolVersion: PROTOCOL_VERSION,
        type: "capabilities"
      })
    );
    await vi.waitFor(() => {
      expect(server?.getRuntimeStatus()).toMatchObject({
        compatible: false,
        connected: true,
        extensionVersion: "1.0.0",
        runtimeRevision: "legacy-unversioned"
      });
    });

    const completion = server.enqueue({
      artifact: {
        assets: [],
        contentHash: "d".repeat(64),
        diagnostics: [],
        html: "<p>legacy unversioned</p>",
        markdown: "legacy unversioned",
        metadata: { tags: [], title: "Legacy unversioned" },
        platform: "jianshu"
      },
      assets: new Map(),
      target: "jianshu"
    });
    const queued = parseBridgeMessage(await nextMessage(client));
    expect(queued).toMatchObject({ type: "enqueue-job" });
    client.close();
    await expect(completion).rejects.toThrow("disconnected");

    await expect(
      server.enqueue({
        artifact: {
          assets: [],
          contentHash: "e".repeat(64),
          diagnostics: [],
          html: "<p>latest required</p>",
          markdown: "latest required",
          metadata: { tags: [], title: "Latest required" },
          platform: "juejin"
        },
        assets: new Map(),
        target: "juejin"
      })
    ).rejects.toThrow(/older runtime|not connected/);
  });

  it("allows the Juejin runtime everywhere except the newer Zhihu writer", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();
    client = new WebSocket(`ws://127.0.0.1:${port}/v1/bridge`, {
      origin: "chrome-extension://crosspost-test"
    });
    const challenge = parseBridgeMessage(await nextMessage(client));
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
    expect(parseBridgeMessage(await nextMessage(client))).toMatchObject({
      accepted: true,
      type: "pair-result"
    });
    client.send(
      JSON.stringify({
        extensionVersion: "1.0.1",
        platforms: [...BROWSER_PLATFORM_IDS],
        protocolVersion: PROTOCOL_VERSION,
        runtimeRevision: "2026-08-21-platform-adapters-6",
        type: "capabilities"
      })
    );
    await vi.waitFor(() => {
      expect(server?.getRuntimeStatus()).toMatchObject({
        compatible: false,
        connected: true,
        runtimeRevision: "2026-08-21-platform-adapters-6"
      });
    });

    const completion = server.enqueue({
      artifact: {
        assets: [],
        contentHash: "f".repeat(64),
        diagnostics: [],
        html: "<p>Juejin runtime</p>",
        markdown: "Juejin runtime",
        metadata: { tags: [], title: "Juejin runtime" },
        platform: "juejin"
      },
      assets: new Map(),
      target: "juejin"
    });
    const queued = parseBridgeMessage(await nextMessage(client));
    if (queued.type !== "enqueue-job") {
      throw new Error("Expected an enqueue job.");
    }
    const binding = {
      draftUrl: "https://juejin.cn/editor/drafts/runtime-6",
      platform: "juejin" as const,
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

    await expect(
      server.enqueue({
        artifact: {
          assets: [],
          contentHash: "a".repeat(64),
          diagnostics: [],
          html: "<p>Zhihu requires runtime 7</p>",
          markdown: "Zhihu requires runtime 7",
          metadata: { tags: [], title: "Zhihu requires runtime 7" },
          platform: "zhihu"
        },
        assets: new Map(),
        target: "zhihu"
      })
    ).rejects.toThrow("older runtime for zhihu");
  });

  it("ignores job results forged by a second paired extension instance", async () => {
    const secret = generateSecretHex();
    server = new BridgeServer(0, secret, () => undefined);
    await server.start();
    const port = server.getBoundPort();

    const owner = await pairClient(port, secret);
    client = owner;
    const impostor = await pairClient(port, secret);
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
    const queued = parseBridgeMessage(await nextMessage(owner));
    if (queued.type !== "enqueue-job") {
      throw new Error("Expected an enqueue job.");
    }

    impostor.send(
      JSON.stringify({
        binding: {
          draftUrl: "https://zhuanlan.zhihu.com/p/forged",
          platform: "zhihu",
          sourceHash: queued.job.artifact.contentHash,
          updatedAt: new Date().toISOString()
        },
        jobId: queued.job.id,
        message: "forged",
        protocolVersion: PROTOCOL_VERSION,
        state: "draft-saved",
        type: "job-result"
      })
    );
    // Real-socket settle: the server reads both connections independently,
    // so a short loopback delay is the only way to let the forged result
    // land before the owner's legitimate confirmation.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const binding = {
      draftUrl: "https://zhuanlan.zhihu.com/p/owner",
      platform: "zhihu" as const,
      sourceHash: queued.job.artifact.contentHash,
      updatedAt: new Date().toISOString()
    };
    owner.send(
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
