/**
 * GET /api/lead-magnet/[slug]
 *
 * Public endpoint to fetch lead magnet metadata for display.
 * No authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { leadMagnets, workspaces } from "@/lib/db/schema";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const env = getBindings();
  const db = createDb(env.DB);

  // Determine workspace from query param or default
  const workspaceSlug =
    request.nextUrl.searchParams.get("workspace") ?? "default";

  const workspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .get();

  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  const magnet = await db
    .select()
    .from(leadMagnets)
    .where(
      and(
        eq(leadMagnets.workspaceId, workspace.id),
        eq(leadMagnets.slug, slug)
      )
    )
    .get();

  if (!magnet) {
    return NextResponse.json(
      { error: "Lead magnet not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    title: magnet.title,
    description: magnet.description,
    fileUrl: magnet.fileUrl,
    fileType: magnet.fileType,
    coverUrl: magnet.coverUrl,
  });
}
