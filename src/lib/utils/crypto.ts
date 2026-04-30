/**
 * AES-256-GCM encryption/decryption using Web Crypto API.
 * Available in Cloudflare Workers and modern browsers.
 *
 * Used for encrypting OAuth tokens before storage in D1.
 */

const ALGORITHM = "AES-GCM";

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param plaintext - The string to encrypt
 * @param keyHex - 32-byte key as hex string (64 chars)
 * @returns Encrypted string in format "iv:ciphertext" (hex encoded)
 */
export async function encrypt(
  plaintext: string,
  keyHex: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBuffer(keyHex),
    ALGORITHM,
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  return bufferToHex(iv.buffer as ArrayBuffer) + ":" + bufferToHex(ciphertext);
}

/**
 * Decrypt a ciphertext string using AES-256-GCM.
 * @param encrypted - Encrypted string in format "iv:ciphertext" (hex encoded)
 * @param keyHex - 32-byte key as hex string (64 chars)
 * @returns Decrypted plaintext string
 */
export async function decrypt(
  encrypted: string,
  keyHex: string
): Promise<string> {
  const colonIndex = encrypted.indexOf(":");
  if (colonIndex === -1) {
    throw new Error("Invalid encrypted format: missing IV separator");
  }

  const ivHex = encrypted.substring(0, colonIndex);
  const ciphertextHex = encrypted.substring(colonIndex + 1);

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBuffer(keyHex),
    ALGORITHM,
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: hexToBuffer(ivHex) },
    key,
    hexToBuffer(ciphertextHex)
  );

  return new TextDecoder().decode(plaintext);
}
