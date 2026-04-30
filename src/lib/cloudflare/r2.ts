import { getBucket } from "./bindings";

/**
 * Upload a file to R2.
 */
export async function uploadToR2(
  key: string,
  body: ArrayBuffer | ReadableStream | string,
  contentType: string
): Promise<void> {
  const bucket = getBucket();
  await bucket.put(key, body, {
    httpMetadata: { contentType },
  });
}

/**
 * Get a file from R2.
 */
export async function getFromR2(
  key: string
): Promise<R2ObjectBody | null> {
  const bucket = getBucket();
  return bucket.get(key);
}

/**
 * Delete a file from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const bucket = getBucket();
  await bucket.delete(key);
}

/**
 * Generate a public URL for an R2 object.
 * Requires R2 custom domain or public bucket configuration.
 */
export function getR2PublicUrl(key: string, bucketDomain: string): string {
  return `https://${bucketDomain}/${key}`;
}
