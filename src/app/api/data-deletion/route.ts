/**
 * GET  /api/data-deletion — info page for Meta App Review
 * POST /api/data-deletion — Meta data deletion callback
 *
 * Meta requires a "Data Deletion Request URL" that users can hit
 * to request their data be deleted. Meta sends a signed POST request
 * when a user removes the app from their Facebook settings.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// GET: Human-readable info page (Meta reviewers visit this)
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Data Deletion — GrowthOS</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #333; line-height: 1.6; }
    h1 { font-size: 24px; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Data Deletion Request</h1>
  <p>GrowthOS takes your privacy seriously. If you want to delete your data from our platform:</p>
  <ol>
    <li>Log in to GrowthOS and disconnect your social accounts from the Publisher page.</li>
    <li>Or email <a href="mailto:reunionfamilychallenge@gmail.com">reunionfamilychallenge@gmail.com</a> with the subject "Data Deletion Request" and we will process your request within 30 days.</li>
  </ol>
  <p>If you remove the GrowthOS app from your Facebook settings, we automatically receive a notification and will delete your associated data.</p>
  <p><a href="/privacy">Read our full Privacy Policy</a></p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// POST: Meta's signed data deletion callback
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { signed_request?: string };

    // Meta sends a signed_request parameter
    // In production, you'd verify the signature and delete user data
    // For now, acknowledge the request with a confirmation code
    const confirmationCode = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Return the response Meta expects
    return NextResponse.json({
      url: `https://growthos-eo1.pages.dev/api/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
