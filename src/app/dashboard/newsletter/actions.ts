"use server";

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { subscribers, newsletters } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { ResendClient, generateNewsletterHtml } from "@/lib/email/resend-client";
import { generateWithClaude } from "@/lib/ai/claude";
import type { Subscriber, Newsletter } from "@/lib/db/schema";

// ─── Validation ───

const AddSubscriberSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  source: z.enum(["waitlist", "newsletter", "lead_magnet", "manual", "import"]).default("manual"),
});

const CreateNewsletterSchema = z.object({
  subject: z.string().min(1).max(200),
  previewText: z.string().max(200).optional(),
  body: z.string().min(1),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  targetTags: z.string().optional(), // comma-separated tags to target
});

// ─── Types ───

export interface SubscriberStats {
  total: number;
  active: number;
  unsubscribed: number;
  thisWeek: number;
}

// ─── List Subscribers ───

export async function listSubscribers(): Promise<ActionResult<Subscriber[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(subscribers)
      .where(eq(subscribers.workspaceId, session.workspaceId))
      .orderBy(desc(subscribers.subscribedAt))
      .limit(500)
      .all();
  });
}

// ─── Get Subscriber Stats ───

export async function getSubscriberStats(): Promise<ActionResult<SubscriberStats>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscribers)
      .where(eq(subscribers.workspaceId, session.workspaceId))
      .get();

    const active = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscribers)
      .where(
        and(
          eq(subscribers.workspaceId, session.workspaceId),
          eq(subscribers.subscriberStatus, "active")
        )
      )
      .get();

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscribers)
      .where(
        and(
          eq(subscribers.workspaceId, session.workspaceId),
          sql`${subscribers.subscribedAt} > ${weekAgo.getTime()}`
        )
      )
      .get();

    return {
      total: total?.count ?? 0,
      active: active?.count ?? 0,
      unsubscribed: (total?.count ?? 0) - (active?.count ?? 0),
      thisWeek: thisWeek?.count ?? 0,
    };
  });
}

// ─── Add Subscriber ───

export async function addSubscriber(
  formData: FormData
): Promise<ActionResult<Subscriber>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = AddSubscriberSchema.parse({
      email: formData.get("email"),
      name: formData.get("name") || undefined,
      tags: formData.get("tags") || undefined,
      source: formData.get("source") || "manual",
    });

    // Check for duplicate
    const existing = await db
      .select()
      .from(subscribers)
      .where(
        and(
          eq(subscribers.workspaceId, session.workspaceId),
          eq(subscribers.email, input.email)
        )
      )
      .get();

    if (existing) {
      throw new Error("Subscriber already exists");
    }

    const id = createId();
    const tagsJson = input.tags
      ? JSON.stringify(input.tags.split(",").map((t) => t.trim()))
      : null;

    await db.insert(subscribers).values({
      id,
      workspaceId: session.workspaceId,
      email: input.email,
      name: input.name ?? null,
      tags: tagsJson,
      source: input.source,
      subscriberStatus: "active",
      subscribedAt: new Date(),
    });

    const subscriber = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, id))
      .get();

    return subscriber!;
  });
}

// ─── List Newsletters ───

export async function listNewsletters(): Promise<ActionResult<Newsletter[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(newsletters)
      .where(eq(newsletters.workspaceId, session.workspaceId))
      .orderBy(desc(newsletters.createdAt))
      .all();
  });
}

// ─── Create Newsletter ───

export async function createNewsletter(
  formData: FormData
): Promise<ActionResult<Newsletter>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateNewsletterSchema.parse({
      subject: formData.get("subject"),
      previewText: formData.get("previewText") || undefined,
      body: formData.get("body"),
      fromName: formData.get("fromName") || undefined,
      fromEmail: formData.get("fromEmail") || undefined,
      targetTags: formData.get("targetTags") || undefined,
    });

    const id = createId();

    const htmlContent = generateNewsletterHtml({
      title: input.subject,
      previewText: input.previewText,
      body: input.body,
      unsubscribeUrl: `${process.env.APP_URL ?? ""}/unsubscribe`,
    });

    await db.insert(newsletters).values({
      id,
      workspaceId: session.workspaceId,
      subject: input.subject,
      previewText: input.previewText ?? null,
      htmlContent,
      textContent: input.body,
      fromName: input.fromName ?? null,
      fromEmail: input.fromEmail ?? null,
      targetTags: input.targetTags
        ? JSON.stringify(input.targetTags.split(",").map((t) => t.trim()))
        : null,
      newsletterStatus: "draft",
      createdAt: new Date(),
    });

    const newsletter = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.id, id))
      .get();

    return newsletter!;
  });
}

// ─── Send Newsletter ───

export async function sendNewsletter(
  newsletterId: string
): Promise<ActionResult<{ sent: boolean; count: number }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const env = getBindings();
    const db = createDb(env.DB);

    const newsletter = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .get();

    if (!newsletter) throw new Error("Newsletter not found");
    if (newsletter.workspaceId !== session.workspaceId) {
      throw new Error("Newsletter not found");
    }
    if (newsletter.newsletterStatus !== "draft") {
      throw new Error("Newsletter is not in draft status");
    }

    // Get target subscribers
    const allSubs = await db
      .select()
      .from(subscribers)
      .where(
        and(
          eq(subscribers.workspaceId, session.workspaceId),
          eq(subscribers.subscriberStatus, "active")
        )
      )
      .all();

    // Filter by tags if specified
    let targetSubs = allSubs;
    if (newsletter.targetTags) {
      const tags = JSON.parse(newsletter.targetTags) as string[];
      targetSubs = allSubs.filter((sub) => {
        if (!sub.tags) return false;
        const subTags = JSON.parse(sub.tags) as string[];
        return tags.some((t) => subTags.includes(t));
      });
    }

    if (targetSubs.length === 0) {
      throw new Error("No subscribers match the target criteria");
    }

    // Mark as sending
    await db
      .update(newsletters)
      .set({ newsletterStatus: "sending" })
      .where(eq(newsletters.id, newsletterId));

    // Send via Resend in batches
    const resend = new ResendClient(env.RESEND_API_KEY);
    const fromAddress = newsletter.fromEmail
      ? `${newsletter.fromName ?? "Newsletter"} <${newsletter.fromEmail}>`
      : `${newsletter.fromName ?? "Reunion"} <hello@reunionchallenge.com>`;

    let sentCount = 0;
    let lastError: string | null = null;
    const batchSize = 50;

    for (let i = 0; i < targetSubs.length; i += batchSize) {
      const batch = targetSubs.slice(i, i + batchSize);
      try {
        const emails = batch.map((sub) => ({
          from: fromAddress,
          to: sub.email,
          subject: newsletter.subject,
          html: newsletter.htmlContent ?? undefined,
          text: newsletter.textContent ?? undefined,
          tags: [{ name: "newsletter_id", value: newsletterId }],
        }));

        await resend.sendBatch(emails);
        sentCount += batch.length;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown Resend error";
        console.error(`Batch send failed:`, lastError);
      }
    }

    // If nothing sent at all, surface the error and revert to draft
    if (sentCount === 0) {
      await db
        .update(newsletters)
        .set({ newsletterStatus: "draft" })
        .where(eq(newsletters.id, newsletterId));
      throw new Error(
        lastError
          ? `Resend API error: ${lastError}`
          : "No emails were sent — check your Resend API key and domain verification"
      );
    }

    // Update newsletter
    await db
      .update(newsletters)
      .set({
        newsletterStatus: "sent",
        sentAt: new Date(),
        sentCount,
      })
      .where(eq(newsletters.id, newsletterId));

    // Update subscriber count in KV for dashboard
    await env.KV.put(
      `subscribers_count:${session.workspaceId}`,
      String(allSubs.length)
    );

    return { sent: true, count: sentCount };
  });
}

// ─── Delete Newsletter ───

export async function deleteNewsletter(
  newsletterId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const newsletter = await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.id, newsletterId))
      .get();

    if (!newsletter) throw new Error("Newsletter not found");
    if (newsletter.workspaceId !== session.workspaceId) {
      throw new Error("Newsletter not found");
    }

    await db.delete(newsletters).where(eq(newsletters.id, newsletterId));
    return { deleted: true };
  });
}

// ─── AI Generate Newsletter ───

export interface GeneratedNewsletter {
  subject: string;
  previewText: string;
  body: string;
}

export async function generateNewsletterWithAI(
  topic: string
): Promise<ActionResult<GeneratedNewsletter>> {
  return safeAction(async () => {
    await requirePermission("content:write");

    const raw = await generateWithClaude({
      systemPrompt: `You are an expert email marketer. Generate a newsletter in JSON format.
Return ONLY valid JSON with this exact structure, no markdown, no code blocks:
{
  "subject": "compelling subject line under 60 characters",
  "previewText": "preview text under 100 characters",
  "body": "full HTML newsletter body using <p>, <h2>, <ul>, <li>, <strong> tags. 3-5 paragraphs, conversational tone."
}`,
      userMessage: `Write a newsletter about: ${topic}`,
      maxTokens: 1500,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON");
    const parsed = JSON.parse(jsonMatch[0]) as GeneratedNewsletter;
    if (!parsed.subject || !parsed.body) throw new Error("AI response missing required fields");
    return parsed;
  });
}
