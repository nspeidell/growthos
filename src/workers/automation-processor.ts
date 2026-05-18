/**
 * Cloudflare Worker: Automation Processor
 *
 * Cron trigger (every minute): reads active automation_enrollments whose
 * next_step_at is due (<= now; 0 means run immediately), executes the
 * current step, then advances to the next one.
 *
 * Supported step types:
 *   send_email  — sends transactional email via Resend API
 *   wait        — delays further execution by N hours
 *   add_tag     — appends a tag to the subscriber's tags JSON array
 *
 * Error handling: any step failure marks the enrollment as "failed" with
 * the error message stored for debugging. The automation's completed_count
 * is incremented only on clean completion.
 *
 * Batch: processes up to 50 due enrollments per cron tick to stay well
 * within Cloudflare Worker CPU limits.
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";

const BATCH_SIZE = 50;
const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM_EMAIL = "hello@reunionchallenge.com";
const DEFAULT_FROM_NAME = "Reunion";

// ── Step type definitions ────────────────────────────────────────────────────

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

// ── D1 row types ─────────────────────────────────────────────────────────────

interface EnrollmentRow {
  id: string;
  automation_id: string;
  subscriber_id: string;
  workspace_id: string;
  current_step: number;
  next_step_at: number | null;
  enrolled_at: number;
  steps: string;                  // JSON — from automations join
  automation_completed_count: number | null;
  subscriber_email: string;
  subscriber_name: string | null;
  subscriber_tags: string | null; // JSON array string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function replaceMergeTags(template: string, name: string | null): string {
  return template.replace(/\{\{name\}\}/gi, name ?? "there");
}

async function sendEmail(opts: {
  apiKey: string;
  to: string;
  subscriberName: string | null;
  step: EmailStep;
}): Promise<void> {
  const from = opts.step.fromEmail
    ? `${opts.step.fromName ?? DEFAULT_FROM_NAME} <${opts.step.fromEmail}>`
    : `${opts.step.fromName ?? DEFAULT_FROM_NAME} <${DEFAULT_FROM_EMAIL}>`;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: replaceMergeTags(opts.step.subject, opts.subscriberName),
      html: replaceMergeTags(opts.step.body, opts.subscriberName),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

// ── Main scheduled handler ───────────────────────────────────────────────────

export default {
  async scheduled(_controller: ScheduledController, env: CloudflareEnv): Promise<void> {
    const now = Date.now();

    // Fetch due enrollments with a single JOIN — avoids N+1 queries
    const { results } = await env.DB.prepare(
      `SELECT
         ae.id,
         ae.automation_id,
         ae.subscriber_id,
         ae.workspace_id,
         ae.current_step,
         ae.next_step_at,
         ae.enrolled_at,
         a.steps,
         a.completed_count   AS automation_completed_count,
         s.email             AS subscriber_email,
         s.name              AS subscriber_name,
         s.tags              AS subscriber_tags
       FROM automation_enrollments ae
       INNER JOIN automations a  ON ae.automation_id = a.id
       INNER JOIN subscribers s  ON ae.subscriber_id  = s.id
       WHERE ae.enrollment_status = 'active'
         AND a.automation_status  = 'active'
         AND ae.next_step_at <= ?
       LIMIT ?`
    )
      .bind(now, BATCH_SIZE)
      .all<EnrollmentRow>();

    if (!results || results.length === 0) return;

    for (const row of results) {
      // Parse steps JSON — malformed config = hard fail
      let steps: AutomationStep[];
      try {
        steps = JSON.parse(row.steps) as AutomationStep[];
      } catch {
        await env.DB.prepare(
          `UPDATE automation_enrollments
           SET enrollment_status = 'failed',
               error_message     = 'Invalid steps JSON in automation config'
           WHERE id = ?`
        )
          .bind(row.id)
          .run();
        continue;
      }

      // Guard: enrollment index already past the end (shouldn't happen, but safe)
      if (row.current_step >= steps.length) {
        await markCompleted(env.DB, row, now);
        continue;
      }

      const step = steps[row.current_step];
      if (!step) continue;

      const nextStepIndex = row.current_step + 1;
      const isLastStep = nextStepIndex >= steps.length;

      try {
        // ── Execute step ─────────────────────────────────────────────────────

        if (step.type === "send_email") {
          await sendEmail({
            apiKey: env.RESEND_API_KEY,
            to: row.subscriber_email,
            subscriberName: row.subscriber_name,
            step,
          });

          if (isLastStep) {
            await markCompleted(env.DB, row, now, nextStepIndex);
          } else {
            await env.DB.prepare(
              `UPDATE automation_enrollments
               SET current_step = ?,
                   next_step_at = 0
               WHERE id = ?`
            )
              .bind(nextStepIndex, row.id)
              .run();
          }

        } else if (step.type === "wait") {
          const delayMs = (step.delayHours ?? 1) * 60 * 60 * 1000;
          // Advance the step counter NOW — when the delay fires, we run
          // whatever step is at nextStepIndex (could itself be a wait)
          if (isLastStep) {
            // A trailing wait step just completes the sequence after the delay
            await env.DB.prepare(
              `UPDATE automation_enrollments
               SET current_step = ?,
                   next_step_at = ?
               WHERE id = ?`
            )
              .bind(nextStepIndex, now + delayMs, row.id)
              .run();
          } else {
            await env.DB.prepare(
              `UPDATE automation_enrollments
               SET current_step = ?,
                   next_step_at = ?
               WHERE id = ?`
            )
              .bind(nextStepIndex, now + delayMs, row.id)
              .run();
          }

        } else if (step.type === "add_tag") {
          if (step.tag) {
            const existing: string[] = row.subscriber_tags
              ? (JSON.parse(row.subscriber_tags) as string[])
              : [];

            if (!existing.includes(step.tag)) {
              await env.DB.prepare(
                `UPDATE subscribers
                 SET tags = ?
                 WHERE id = ?`
              )
                .bind(JSON.stringify([...existing, step.tag]), row.subscriber_id)
                .run();
            }
          }

          if (isLastStep) {
            await markCompleted(env.DB, row, now, nextStepIndex);
          } else {
            await env.DB.prepare(
              `UPDATE automation_enrollments
               SET current_step = ?,
                   next_step_at = 0
               WHERE id = ?`
            )
              .bind(nextStepIndex, row.id)
              .run();
          }
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await env.DB.prepare(
          `UPDATE automation_enrollments
           SET enrollment_status = 'failed',
               error_message     = ?
           WHERE id = ?`
        )
          .bind(message, row.id)
          .run();
      }
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// ── Completion helper ────────────────────────────────────────────────────────

async function markCompleted(
  db: D1Database,
  row: EnrollmentRow,
  now: number,
  nextStepIndex?: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE automation_enrollments
       SET enrollment_status = 'completed',
           completed_at      = ?,
           current_step      = COALESCE(?, current_step)
       WHERE id = ?`
    )
    .bind(now, nextStepIndex ?? null, row.id)
    .run();

  await db
    .prepare(
      `UPDATE automations
       SET completed_count = COALESCE(completed_count, 0) + 1
       WHERE id = ?`
    )
    .bind(row.automation_id)
    .run();
}
