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
      // Advertise range support so browsers (esp. Safari) will stream/seek video.
      "Accept-Ranges": "bytes",
    };

    if (download) {
      const filename = r2Key.split("/").pop() ?? "download";
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    // Honor HTTP Range requests — <video>/<audio> elements require 206 partial
    // responses to begin playback reliably. Without this, the first play often
    // fails until a page refresh.
    const rangeHeader = request.headers.get("range");
    const size = object.size;
    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (match) {
        let start = match[1] ? parseInt(match[1], 10) : 0;
        let end = match[2] ? parseInt(match[2], 10) : size - 1;
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end) || end >= size) end = size - 1;
        if (start > end || start >= size) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
          });
        }
        const ranged = await BUCKET.get(r2Key, { range: { offset: start, length: end - start + 1 } });
        if (!ranged) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return new NextResponse(ranged.body, {
          status: 206,
          headers: {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": String(end - start + 1),
          },
        });
      }
    }

    return new NextResponse(object.body, {
      headers: { ...headers, "Content-Length": String(size) },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
