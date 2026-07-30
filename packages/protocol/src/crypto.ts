function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) {
    throw new Error("Expected an even-length hexadecimal value.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function generateSecretHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hmacSha256Hex(secretHex: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(secretHex)),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(new TextEncoder().encode(message))
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyHmacSha256Hex(
  secretHex: string,
  message: string,
  proofHex: string
): Promise<boolean> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(secretHex)),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"]
  );
  return globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(hexToBytes(proofHex)),
    toArrayBuffer(new TextEncoder().encode(message))
  );
}
