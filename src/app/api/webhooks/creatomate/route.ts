/**
 * POST /api/webhooks/creatomate
 *
 * Receives render completion webhooks from Creatomate.
 * Downloads the rendered video/image and stores in R2.
 * Updates the media_jobs record as completed.
 */

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";

interface CreatomateWebhookPayload {
  id: string;
  status: "succeeded" | "failed";
  url: string | null;
  error_message: string | null;
  metadata: string | null;
  snapshot_url: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as CreatomateWebhookPayload;
    const { DB, BUCKET } = getBindings();

    // Parse metadata to get jobId
    let jobId: string | null = null;
    let workspaceId: string | null = null;

    if (payload.metadata) {
      try {
        const meta = JSON.parse(payload.metadata);
        jobId = meta.jobId ?? null;
        workspaceId = meta.workspaceId ?? null;
      } catch {
        // Metadata might be just the jobId string
        console.warn("[creatomate-webhook] Could not parse metadata JSON, using raw value");
        jobId = payload.metadata;
      }
    }

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId in metadata" }, { status: 400 });
    }

    if (payload.status === "failed") {
      await DB.prepare(
        `UPDATE media_jobs SET job_status = 'failed', error_message = ? WHERE id = ?`
      )
        .bind(payload.error_message ?? "Creatomate render failed", jobId)
        .run();

      return NextResponse.json({ ok: true });
    }

    if (payload.status === "succeeded" && payload.url) {
      // Download the rendered file from Creatomate CDN
      const response = await fetch(payload.url);
      if (!response.ok) {
        throw new Error(`Failed to download render: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") ?? "video/mp4";

      // Determine file extension
      const ext = contentType.includes("mp4")
        ? "mp4"
        : contentType.includes("png")
          ? "png"
          : contentType.includes("gif")
            ? "gif"
            : "mp4";

      // Upload to R2
      const r2Key = `media/${workspaceId ?? "unknown"}/${jobId}.${ext}`;
      await BUCKET.put(r2Key, buffer, {
        httpMetadata: { contentType },
      });

      // Update job as completed
      await DB.prepare(
        `UPDATE media_jobs
         SET job_status = 'completed', result_r2_key = ?, completed_at = ?
         WHERE id = ?`
      )
        .bind(r2Key, Date.now(), jobId)
        .run();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Creatomate webhook error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook processing failed" },
      { status: 500 }
    );
  }
}
