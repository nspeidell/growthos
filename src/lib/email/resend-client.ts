/**
 * Resend Email Client
 *
 * Sends transactional and marketing emails via Resend API.
 * Compatible with Cloudflare Workers (fetch-only, no Node.js deps).
 */

const RESEND_API_BASE = "https://api.resend.com";

export interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  id: string;
}

export interface ResendBatchResult {
  data: SendEmailResult[];
}

export class ResendClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Send a single email.
   */
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
        tags: options.tags,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<SendEmailResult>;
  }

  /**
   * Send a batch of emails (up to 100 per call).
   */
  async sendBatch(
    emails: SendEmailOptions[]
  ): Promise<ResendBatchResult> {
    const response = await fetch(`${RESEND_API_BASE}/emails/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        emails.map((e) => ({
          from: e.from,
          to: Array.isArray(e.to) ? e.to : [e.to],
          subject: e.subject,
          html: e.html,
          text: e.text,
          reply_to: e.replyTo,
          tags: e.tags,
        }))
      ),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend batch error ${response.status}: ${error}`);
    }

    return response.json() as Promise<ResendBatchResult>;
  }
}

/**
 * Generate a simple newsletter HTML template.
 */
export function generateNewsletterHtml(options: {
  title: string;
  previewText?: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerText?: string;
  unsubscribeUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  ${options.previewText ? `<span style="display:none">${escapeHtml(options.previewText)}</span>` : ""}
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%">
          <tr>
            <td style="padding:32px 24px">
              <h1 style="margin:0 0 16px;font-size:24px;color:#111">${escapeHtml(options.title)}</h1>
              <div style="font-size:16px;line-height:1.6;color:#333">
                ${options.body}
              </div>
              ${
                options.ctaText && options.ctaUrl
                  ? `<table cellpadding="0" cellspacing="0" style="margin:24px 0">
                      <tr>
                        <td style="background:#2563eb;border-radius:8px;padding:12px 24px">
                          <a href="${escapeHtml(options.ctaUrl)}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(options.ctaText)}</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#888">
              ${options.footerText ? escapeHtml(options.footerText) : ""}
              <br><a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#888">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
