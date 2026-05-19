import { NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { kvGet } from "@/lib/cloudflare/kv";

export const runtime = "edge";

export async function GET() {
  // Debug endpoint — only active in non-production
  const env = getBindings();
  if (env.ENVIRONMENT === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const [error, tokenDebug] = await Promise.all([
    kvGet<unknown>("oauth_last_error"),
    kvGet<unknown>("oauth_token_debug"),
  ]);
  return NextResponse.json({ error, tokenDebug });
}
