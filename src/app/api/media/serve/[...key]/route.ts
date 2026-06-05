/**
 * GET /api/media/serve/[...key]
 *
 * Serves media files from R2 with proper content-type headers.
 * Validates workspace access before serving.
 */

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  json: "application/json",
  svg: "image/svg+xml",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    const r2Key = key.join("/");
    const { BUCKET } = getBindings();

    // Allow worker-to-worker access via CRON_SECRET token (used by media-gen worker
    // to give Creatomate a downloadable URL without session cookies)
    const token = request.nextUrl.searchParams.get("token");
    const env = getBindings();
    const isWorkerToken = token && env.MEDIA_SERVE_TOKEN && token === env.MEDIA_SERVE_TOKEN;

    if (!isWorkerToken) {
      // Fall back to session auth for browser requests
      const session = await requirePermission("content:read");
      const keyParts = r2Key.split("/");
      if (keyParts[0] === "media" && keyParts[1] !== session.workspaceId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const object = await BUCKET.get(r2Key);

    if (!object) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Determine content type
    const ext = r2Key.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      object.httpMetadata?.contentType ??
      CONTENT_TYPES[ext] ??
      "application/octet-stream";

    // Check for download request
    const download = request.nextUrl.searchParams.get("download");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    };

    if (download) {
      const filename = r2Key.split("/").pop() ?? "download";
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    return new NextResponse(object.body, { headers });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
