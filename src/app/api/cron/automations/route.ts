/**
 * GET /api/cron/automations
 *
 * Runs every minute (piggybacks on the existing cron schedule).
 * Finds active automation enrollments whose next_step_at <= now,
 * executes the current step, then advances to the next step.
 *
 * Supported step types:
 *   send_email  — sends via Resend
 *   wait        — delays execution by N hours
 *   add_tag     — appends a tag to the subscriber
 */

import { NextResponse } from "next/server";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { automations, automationEnrollments, subscribers } from "@/lib/db/schema";
import { ResendClient } from "@/lib/email/resend-client";

export const runtime = "edge";
export const maxDuration = 60;

interface EmailStep {
  type: "send_email";
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
}

interface WaitStep {
  type: "wait";
  delayHours: number;
}

interface AddTagStep {
  type: "add_tag";
  tag: string;
}

type AutomationStep = EmailStep | WaitStep | AddTagStep;

export async function GET() {
  const env = getBindings();
  const db = createDb(env.DB);
  const now = Date.now();

  // Find enrollments that are due to run
  const due = await db
    .select({
      enrollment: automationEnrollments,
      automation: automations,
    })
    .from(automationEnrollments)
    .innerJoin(automations, eq(automationEnrollments.automationId, automations.id))
    .where(
      and(
        eq(automationEnrollments.enrollmentStatus, "active"),
        eq(automations.automationStatus, "active"),
        or(
          isNull(automationEnrollments.nextStepAt),
          lte(automationEnrollments.nextStepAt, now)
        )
      )
    )
    .limit(50)
    .all();

  if (due.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const { enrollment, automation } of due) {
    let steps: AutomationStep[] = [];
    try {
      steps = JSON.parse(automation.steps) as AutomationStep[];
    } catch {
      await db
        .update(automationEnrollments)
        .set({ enrollmentStatus: "failed", errorMessage: "Invalid steps JSON" })
        .where(eq(automationEnrollments.id, enrollment.id));
      results.push({ id: enrollment.id, status: "failed", error: "Invalid steps JSON" });
      continue;
    }

    // Completed all steps
    if (enrollment.currentStep >= steps.length) {
      await db
        .update(automationEnrollments)
        .set({ enrollmentStatus: "completed", completedAt: now })
        .where(eq(automationEnrollments.id, enrollment.id));

      await db
        .update(automations)
        .set({ completedCount: (automation.completedCount ?? 0) + 1 })
        .where(eq(automations.id, automation.id));

      results.push({ id: enrollment.id, status: "completed" });
      continue;
    }

    const step = steps[enrollment.currentStep];
    if (!step) {
      // Shouldn't happen, but guard against undefined
      results.push({ id: enrollment.id, status: "processed" });
      continue;
    }

    const nextStepIndex = enrollment.currentStep + 1;
    const isLastStep = nextStepIndex >= steps.length;

    try {
      // ── Execute the step ──
      if (step.type === "send_email") {
        const sub = await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.id, enrollment.subscriberId))
          .get();

        if (sub) {
          const resend = new ResendClient(env.RESEND_API_KEY);
          const fromAddress = step.fromEmail
            ? `${step.fromName ?? "Reunion"} <${step.fromEmail}>`
            : `${step.fromName ?? "Reunion"} <hello@reunionchallenge.com>`;

          // Replace {{name}} merge tag
          const personalisedBody = (step.body ?? "").replace(
            /\{\{name\}\}/gi,
            sub.name ?? "there"
          );
          const personalisedSubject = (step.subject ?? "").replace(
            /\{\{name\}\}/gi,
            sub.name ?? "there"
          );

          await resend.send({
            from: fromAddress,
            to: sub.email,
            subject: personalisedSubject,
            html: personalisedBody,
          });
        }

        // Advance immediately
        if (isLastStep) {
          await db
            .update(automationEnrollments)
            .set({ enrollmentStatus: "completed", completedAt: now, currentStep: nextStepIndex })
            .where(eq(automationEnrollments.id, enrollment.id));
          await db
            .update(automations)
            .set({ completedCount: (automation.completedCount ?? 0) + 1 })
            .where(eq(automations.id, automation.id));
        } else {
          await db
            .update(automationEnrollments)
            .set({ currentStep: nextStepIndex, nextStepAt: null })
            .where(eq(automationEnrollments.id, enrollment.id));
        }

      } else if (step.type === "wait") {
        const delayMs = (step.delayHours ?? 1) * 60 * 60 * 1000;
        await db
          .update(automationEnrollments)
          .set({ currentStep: nextStepIndex, nextStepAt: now + delayMs })
          .where(eq(automationEnrollments.id, enrollment.id));

      } else if (step.type === "add_tag") {
        const sub = await db
          .select()
          .from(subscribers)
          .where(eq(subscribers.id, enrollment.subscriberId))
          .get();

        if (sub && step.tag) {
          const existing: string[] = sub.tags ? (JSON.parse(sub.tags) as string[]) : [];
          if (!existing.includes(step.tag)) {
            await db
              .update(subscribers)
              .set({ tags: JSON.stringify([...existing, step.tag]) })
              .where(eq(subscribers.id, sub.id));
          }
        }

        if (isLastStep) {
          await db
            .update(automationEnrollments)
            .set({ enrollmentStatus: "completed", completedAt: now, currentStep: nextStepIndex })
            .where(eq(automationEnrollments.id, enrollment.id));
          await db
            .update(automations)
            .set({ completedCount: (automation.completedCount ?? 0) + 1 })
            .where(eq(automations.id, automation.id));
        } else {
          await db
            .update(automationEnrollments)
            .set({ currentStep: nextStepIndex, nextStepAt: null })
            .where(eq(automationEnrollments.id, enrollment.id));
        }
      }

      results.push({ id: enrollment.id, status: "processed" });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(automationEnrollments)
        .set({ enrollmentStatus: "failed", errorMessage })
        .where(eq(automationEnrollments.id, enrollment.id));
      results.push({ id: enrollment.id, status: "failed", error: errorMessage });
    }
  }

  return NextResponse.json({
    processed: results.filter((r) => r.status === "processed" || r.status === "completed").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}

