import type { PublishJob } from "@crosspost/protocol";

const MAX_JOB_ASSET_BYTES = 25 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function hydrateJobAssets(
  job: PublishJob
): Promise<{ html: string; markdown: string }> {
  let totalBytes = 0;
  let html = job.artifact.html;
  let markdown = job.artifact.markdown;

  for (const descriptor of job.artifact.assets) {
    let response: Response;
    try {
      response = await self.fetch(`${job.assetBaseUrl}/${descriptor.id}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${job.assetToken}`
        },
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      throw new Error(
        `Asset ${descriptor.name} for ${job.target} could not be loaded from the Obsidian bridge within 30s (${error instanceof Error ? error.message : String(error)}).`
      );
    }
    if (!response.ok) {
      throw new Error(`Asset ${descriptor.name} could not be loaded (${response.status}).`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_JOB_ASSET_BYTES) {
      throw new Error("The article assets exceed the 25 MiB browser bridge limit.");
    }
    const dataUrl = `data:${descriptor.mimeType};base64,${bytesToBase64(bytes)}`;
    const marker = `crosspost-asset://${descriptor.id}`;
    html = html.replaceAll(marker, dataUrl);
    markdown = markdown.replaceAll(marker, dataUrl);
  }

  if (html.includes("crosspost-asset://") || markdown.includes("crosspost-asset://")) {
    throw new Error("At least one article asset could not be resolved.");
  }
  return { html, markdown };
}
