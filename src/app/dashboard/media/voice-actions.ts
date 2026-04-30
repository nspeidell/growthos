"use server";

import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { voiceProfiles } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";

interface VoiceProfileSummary {
  id: string;
  name: string;
  isFounderVoice: boolean | null;
}

export async function listVoiceProfiles(): Promise<ActionResult<VoiceProfileSummary[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const profiles = await db
      .select({
        id: voiceProfiles.id,
        name: voiceProfiles.name,
        isFounderVoice: voiceProfiles.isFounderVoice,
      })
      .from(voiceProfiles)
      .where(eq(voiceProfiles.workspaceId, session.workspaceId))
      .all();

    return profiles;
  });
}
