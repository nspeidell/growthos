/**
 * GET /api/cron/community-posts
 *
 * Daily community post generator.
 * Runs at 12:00 UTC (5am MT / 7am ET) via Cloudflare cron.
 * For each active campaign, generates AI-drafted posts for Facebook + Reddit
 * based on rotating content pillars, current events from signals, and
 * Reunion brand doctrine.
 *
 * Posts are saved as drafts — user copies/pastes them each morning.
 */

import { NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { generateWithClaude } from "@/lib/ai/claude";
import { createId } from "@paralleldrive/cuid2";

export const runtime = "edge";
export const maxDuration = 60;

// ─── Content Pillar Rotation ─────────────────────────────────────────────────
// Cycles through pillars by day of week. Feels natural, not repetitive.

const PILLAR_ROTATION = [
  "engagement_question",   // Sunday
  "family_connection",     // Monday
  "current_events",        // Tuesday
  "legacy_memory",         // Wednesday
  "humor",                 // Thursday
  "family_connection",     // Friday
  "engagement_question",   // Saturday
];

const PILLAR_LABELS: Record<string, string> = {
  family_connection: "Family Connection & Activities",
  legacy_memory: "Legacy & Memory Keeping",
  current_events: "Current Events Through a Family Lens",
  engagement_question: "Community Engagement Question",
  humor: "Family Humor & Relatable Moments",
};

// ─── Prompt Builders ─────────────────────────────────────────────────────────

function buildFacebookPrompt(options: {
  pillar: string;
  pillarLabel: string;
  dayOfWeek: string;
  communityName: string;
  doctrineMode: string;
  customInstructions: string | null;
  currentEvents: string[];
}): string {
  const { pillar, pillarLabel, dayOfWeek, communityName, doctrineMode, customInstructions, currentEvents } = options;

  const eventContext = currentEvents.length > 0
    ? `\n\nRecent trending topics in the family/connection space (use if relevant, don't force it):\n${currentEvents.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
    : "";

  const doctrineNote = doctrineMode === "hormozi"
    ? "Write with Alex Hormozi's directness — big promise, concrete value, no fluff."
    : doctrineMode === "garyvee"
    ? "Write with GaryVee's raw authenticity — document, don't create. Short punchy lines."
    : "Write in a warm, human voice. Feel like a real person in the community, not a brand.";

  const pillarInstructions: Record<string, string> = {
    family_connection: `Write a post that gives families something concrete to DO together. Could be an activity, a challenge for the week, or a ritual to try. Make it specific and actionable. End with a call to action — 'Who's trying this?' or 'Drop your family's version below.'`,
    legacy_memory: `Write a post about preserving family stories, interviewing grandparents, or honoring what makes a family unique. Make it emotionally resonant. Include a question that invites people to share their own family stories.`,
    current_events: `Take something happening in the news or culture right now and reframe it through the lens of family and connection. Don't be political. Find the human, relatable angle. Ask the community what they think.`,
    engagement_question: `Write a single, irresistible engagement question for the community. It should be easy to answer in one sentence, deeply relatable, and make people want to see other people's answers. Examples: 'What's one thing your parents always said that you swore you'd never say — but now you do?' Keep it tight.`,
    humor: `Write a genuinely funny, relatable post about family life. Think: things kids say, generational humor, family group chat chaos, holiday family dynamics. It should make people tag someone. No cringe, no forced jokes — real relatable humor.`,
  };

  return `You are writing a Facebook Group post for "${communityName}" — a warm, engaged community of families using the Reunion app to stay connected.

Tone direction: ${doctrineNote}

Today is ${dayOfWeek}. Content pillar: ${pillarLabel}.

${pillarInstructions[pillar] ?? pillarInstructions.engagement_question}${eventContext}

${customInstructions ? `Additional brand guidance: ${customInstructions}` : ""}

RULES:
- 50–150 words max. Facebook Group posts are SHORT.
- Human, not corporate. Never mention "Reunion" unless it's completely natural.
- End with a question or call to action that drives comments.
- No hashtags. No emojis unless they add genuine warmth (1–2 max).
- Write only the post text. No title, no meta-commentary, no quotation marks around the post.`;
}

function buildRedditPrompt(options: {
  pillar: string;
  pillarLabel: string;
  dayOfWeek: string;
  communityName: string;
  customInstructions: string | null;
  currentEvents: string[];
}): string {
  const { pillar, pillarLabel, dayOfWeek, customInstructions, currentEvents } = options;

  const eventContext = currentEvents.length > 0
    ? `\n\nRecent family/connection topics gaining traction (weave in if genuinely relevant):\n${currentEvents.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
    : "";

  const pillarInstructions: Record<string, string> = {
    family_connection: `Write a personal, first-person Reddit post about a family connection moment — something you tried, something you're struggling with, or something you're curious about. Ask for advice or share what worked.`,
    legacy_memory: `Write a Reddit post asking for help capturing family stories, or sharing a meaningful experience preserving a family member's legacy. Make it specific and real.`,
    current_events: `Write a Reddit post connecting a current cultural moment to family dynamics. Start with the news angle, then make it personal and ask what others experience.`,
    engagement_question: `Write a Reddit question post (like an 'Ask Reddit' style) about family life, relationships, or intergenerational connection. Keep it open-ended and relatable.`,
    humor: `Write a light, funny Reddit post about family chaos — something that happened, a pattern you noticed, or a universal family experience. Dry humor works great here.`,
  };

  return `You are writing a Reddit post for the Reunion community strategy.

Reddit context: Posts must feel like genuine community members talking, NOT a brand. First-person, authentic, zero marketing language. Reddit users will downvote anything that smells like promotion.

Today is ${dayOfWeek}. Content pillar: ${pillarLabel}.

${pillarInstructions[pillar] ?? pillarInstructions.engagement_question}${eventContext}

${customInstructions ? `Additional context: ${customInstructions}` : ""}

RULES:
- 80–200 words. Reddit appreciates more context than Facebook.
- First-person voice ("I", "my family", "we").
- Conversational, slightly imperfect — not polished.
- Never mention Reunion, apps, or products. Pure community.
- End with a question or invite people to share.
- Also write a short title (5–10 words, plain language, no clickbait).
- Format: TITLE: [title] on the first line, then a blank line, then the post body.`;
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export async function GET() {
  try {
    const env = getBindings();
    const db = env.DB;

    const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const pillarKey = PILLAR_ROTATION[new Date().getUTCDay()] ?? "engagement_question";
    const pillarLabel = PILLAR_LABELS[pillarKey] ?? pillarKey;

    // Fetch all active campaigns not yet run today
    const campaigns = await db
      .prepare(
        `SELECT cc.*, c.name as community_name, c.platform, c.platform_id, c.workspace_id as comm_workspace_id
         FROM community_campaigns cc
         JOIN communities c ON cc.community_id = c.id
         WHERE cc.is_active = 1
         AND (cc.last_generated_date IS NULL OR cc.last_generated_date != ?)`
      )
      .bind(todayUtc)
      .all<{
        id: string;
        workspace_id: string;
        community_id: string;
        community_name: string;
        platform: string;
        platform_id: string | null;
        doctrine_mode: string;
        content_pillars: string;
        custom_instructions: string | null;
        include_current_events: number;
        generate_at_utc_hour: number;
      }>();

    if (!campaigns.results.length) {
      return NextResponse.json({ generated: 0, message: "No active campaigns to run" });
    }

    const results: Array<{ campaignId: string; postsCreated: number; error?: string }> = [];

    for (const campaign of campaigns.results) {
      try {
        // Check if it's time to generate for this campaign
        const currentHour = new Date().getUTCHours();
        if (currentHour < campaign.generate_at_utc_hour) {
          results.push({ campaignId: campaign.id, postsCreated: 0 });
          continue;
        }

        // Pull current events from signals if enabled
        let currentEvents: string[] = [];
        if (campaign.include_current_events) {
          const signals = await db
            .prepare(
              `SELECT title, summary FROM signals
               WHERE workspace_id = ?
               AND created_at > ?
               AND is_dismissed = 0
               ORDER BY priority_score DESC
               LIMIT 3`
            )
            .bind(
              campaign.workspace_id,
              Math.floor(Date.now() / 1000) - 48 * 3600 // last 48 hours
            )
            .all<{ title: string; summary: string | null }>();

          currentEvents = signals.results.map(s =>
            s.summary ? `${s.title} — ${s.summary}` : s.title
          );
        }

        // Parse content pillars — override day rotation if campaign has specific pillars
        let activePillar = pillarKey;
        try {
          const pillars: string[] = JSON.parse(campaign.content_pillars);
          if (pillars.length > 0) {
            // Rotate through campaign's own pillars by day index
            const idx = new Date().getUTCDay() % pillars.length;
            const rawPillar = pillars[idx] ?? pillars[0] ?? pillarKey;
            // Normalize to known keys
            if (rawPillar.includes("connect")) activePillar = "family_connection";
            else if (rawPillar.includes("legacy") || rawPillar.includes("memory")) activePillar = "legacy_memory";
            else if (rawPillar.includes("current") || rawPillar.includes("event")) activePillar = "current_events";
            else if (rawPillar.includes("humor") || rawPillar.includes("fun")) activePillar = "humor";
            else activePillar = "engagement_question";
          }
        } catch { /* use day rotation */ }

        const activePillarLabel = PILLAR_LABELS[activePillar] ?? activePillar;

        let postsCreated = 0;

        // ── Generate Facebook post ──
        if (campaign.platform === "facebook") {
          const prompt = buildFacebookPrompt({
            pillar: activePillar,
            pillarLabel: activePillarLabel,
            dayOfWeek,
            communityName: campaign.community_name,
            doctrineMode: campaign.doctrine_mode,
            customInstructions: campaign.custom_instructions,
            currentEvents,
          });

          const generated = await generateWithClaude({
            systemPrompt: "You are a community content expert specializing in Facebook Groups for family audiences. Write posts that spark genuine conversation.",
            userMessage: prompt,
            maxTokens: 400,
          });

          const postId = createId();
          const now = Math.floor(Date.now() / 1000);
          await db
            .prepare(
              `INSERT INTO community_posts
               (id, community_id, workspace_id, post_type, title, body, post_status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
            )
            .bind(
              postId,
              campaign.community_id,
              campaign.workspace_id,
              "text",
              `${activePillarLabel} — ${dayOfWeek}`,
              generated.trim(),
              now,
              now
            )
            .run();

          postsCreated++;
        }

        // ── Generate Reddit post ──
        if (campaign.platform === "reddit") {
          const prompt = buildRedditPrompt({
            pillar: activePillar,
            pillarLabel: activePillarLabel,
            dayOfWeek,
            communityName: campaign.community_name,
            customInstructions: campaign.custom_instructions,
            currentEvents,
          });

          const generated = await generateWithClaude({
            systemPrompt: "You are writing authentic Reddit posts that feel like genuine community members, never brands. Be real, be human, be curious.",
            userMessage: prompt,
            maxTokens: 500,
          });

          // Parse TITLE: / body format
          const lines = generated.trim().split("\n");
          let title = `${activePillarLabel} — ${dayOfWeek}`;
          let body = generated.trim();
          if (lines[0]?.startsWith("TITLE:")) {
            title = lines[0].replace("TITLE:", "").trim();
            body = lines.slice(2).join("\n").trim();
          }

          const postId = createId();
          const now = Math.floor(Date.now() / 1000);
          await db
            .prepare(
              `INSERT INTO community_posts
               (id, community_id, workspace_id, post_type, title, body, post_status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
            )
            .bind(
              postId,
              campaign.community_id,
              campaign.workspace_id,
              "text",
              title,
              body,
              now,
              now
            )
            .run();

          postsCreated++;
        }

        // Mark campaign as run today
        await db
          .prepare(`UPDATE community_campaigns SET last_generated_date = ?, updated_at = ? WHERE id = ?`)
          .bind(todayUtc, Math.floor(Date.now() / 1000), campaign.id)
          .run();

        results.push({ campaignId: campaign.id, postsCreated });
      } catch (err) {
        results.push({
          campaignId: campaign.id,
          postsCreated: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalCreated = results.reduce((sum, r) => sum + r.postsCreated, 0);
    return NextResponse.json({ generated: totalCreated, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
