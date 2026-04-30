import { getKv } from "./bindings";

/**
 * Get a value from KV, optionally typed.
 */
export async function kvGet<T = string>(key: string): Promise<T | null> {
  const kv = getKv();
  const value = await kv.get(key);
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

/**
 * Set a value in KV with optional TTL.
 */
export async function kvSet(
  key: string,
  value: string | object,
  ttlSeconds?: number
): Promise<void> {
  const kv = getKv();
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  await kv.put(key, serialized, ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
}

/**
 * Delete a value from KV.
 */
export async function kvDelete(key: string): Promise<void> {
  const kv = getKv();
  await kv.delete(key);
}
