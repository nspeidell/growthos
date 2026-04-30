/**
 * POST /api/seo/aeo-analyze
 *
 * AI Answer Engine Optimization — scores content for discoverability
 * in AI-generated answers (ChatGPT, Perplexity, Google AI Overviews).
 *
 * Analyzes a page and returns actionable suggestions across 6 dimensions:
 * 1. Question extraction — implicit questions the content answers
 * 2. FAQ generation — structured FAQ candidates with schema markup
 * 3. Snippet optimization — first paragraph direct-answer quality
 * 4. Entity optimization — brand/key term placement
 * 5. Citation worthiness — stats, research, expert quotes
 * 6. Content freshness — staleness signals
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { generateWithClaude } from "@/lib/ai/claude";

export const runtime = "edge";

interface AEOSuggestion {
  dimension: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
}

interface AEOAnalysisResult {
  score: number;
  suggestions: AEOSuggestion[];
  extractedQuestions: string[];
  faqCandidates: Array<{ question: string; answer: string }>;
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = (await request.json()) as { pageId: string };
  if (!pageId) {
    return NextResponse.json(
      { error: "pageId is required" },
      { status: 400 }
    );
  }

  const { DB } = getBindings();
  const db = createDb(DB);

  const page = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.id, pageId),
        eq(pages.workspaceId, session.workspaceId)
      )
    )
    .get();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const contentForAnalysis = [
    `Title: ${page.title}`,
    `H1: ${page.h1 ?? page.title}`,
    `Meta Title: ${page.metaTitle ?? "Not set"}`,
    `Meta Description: ${page.metaDesc ?? "Not set"}`,
    `Schema Type: ${page.schemaType ?? "None"}`,
    `Body:\n${page.body ?? "(empty)"}`,
  ].join("\n\n");

  try {
    const analysis = await generateWithClaude({
      systemPrompt: `You are an AI Answer Engine Optimization (AEO) expert. Analyze web content for its likelihood of being surfaced in AI-generated answers (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot).

Score the content 0-100 and provide specific, actionable suggestions across these dimensions:
1. **Question Extraction** — What implicit questions does this content answer? List them.
2. **FAQ Generation** — Generate 3-5 FAQ question/answer pairs that could be added as structured FAQ schema.
3. **Snippet Optimization** — Does the first paragraph directly answer a clear query? How to improve?
4. **Entity Optimization** — Are key brand names, terms, and entities mentioned early and clearly?
5. **Citation Worthiness** — Does it contain original stats, research, expert quotes, or unique data that AI would cite?
6. **Content Freshness** — Any signals of staleness? Dates, outdated references?

Return ONLY a JSON object with this exact structure:
{
  "score": <number 0-100>,
  "suggestions": [
    {
      "dimension": "<dimension name>",
      "severity": "high|medium|low",
      "title": "<short title>",
      "description": "<what the issue is>",
      "action": "<specific action to take>"
    }
  ],
  "extractedQuestions": ["<question 1>", "<question 2>", ...],
  "faqCandidates": [
    { "question": "<q>", "answer": "<a>" }
  ]
}`,
      userMessage: contentForAnalysis,
      maxTokens: 4096,
      temperature: 0.3,
    });

    const result = JSON.parse(analysis) as AEOAnalysisResult;

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
