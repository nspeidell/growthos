import { NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { kvGet } from "@/lib/cloudflare/kv";

export const runtime = "edge";

export async function GET() {
  const env = getBindings();
  const [error, tokenDebug] = await Promise.all([
    kvGet<unknown>("oauth_last_error"),
    kvGet<unknown>("oauth_token_debug"),
  ]);
  // Show which secrets are present (not values)
  const secrets = {
    META_APP_ID: !!(env as unknown as Record<string,string>)["META_APP_ID"],
    INSTAGRAM_APP_ID: !!(env as unknown as Record<string,string>)["INSTAGRAM_APP_ID"],
    INSTAGRAM_APP_SECRET: !!(env as unknown as Record<string,string>)["INSTAGRAM_APP_SECRET"],
    INSTAGRAM_APP_ID_value_prefix: ((env as unknown as Record<string,string>)["INSTAGRAM_APP_ID"] ?? "").slice(0, 8),
  };
  return NextResponse.json({ error, tokenDebug, secrets });
}
