/**
 * Video Trust Analysis Module.
 *
 * Uses an LLM to scan social media comments for keywords/patterns
 * that indicate viewers perceive a video as "fake" or AI-generated.
 *
 * Flags videos that fail the realism test so creators can adjust strategy.
 */

export interface TrustAnalysisResult {
  sentimentScore: number; // -1.0 (very negative) to 1.0 (very positive)
  trustFlag: "trusted" | "suspect" | "flagged";
  flaggedPhrases: string[];
  totalComments: number;
  negativeComments: number;
  summary: string;
}

// Keywords that signal viewers perceive content as AI/inauthentic
const TRUST_RED_FLAG_KEYWORDS = [
  "fake",
  "ai generated",
  "ai-generated",
  "bot",
  "deepfake",
  "not real",
  "so fake",
  "obviously ai",
  "clearly ai",
  "ai voice",
  "sounds robotic",
  "robot voice",
  "uncanny",
  "soulless",
  "generated",
  "synthetic",
  "not a real person",
  "chatgpt",
  "midjourney",
  "this is ai",
  "ai slop",
  "spam",
  "scam",
];

/**
 * Analyze video comments for trust/realism perception.
 *
 * Uses Claude to perform nuanced sentiment analysis beyond keyword matching,
 * accounting for sarcasm, context, and conversation flow.
 *
 * @param comments - Array of comment texts from the video post
 * @param anthropicApiKey - API key for Claude
 * @returns Trust analysis result with sentiment score and flag
 */
export async function analyzeVideoTrust(
  comments: string[],
  anthropicApiKey: string
): Promise<TrustAnalysisResult> {
  if (comments.length === 0) {
    return {
      sentimentScore: 0,
      trustFlag: "trusted",
      flaggedPhrases: [],
      totalComments: 0,
      negativeComments: 0,
      summary: "No comments to analyze.",
    };
  }

  // Quick pre-filter: check for obvious red flag keywords
  const keywordMatches = quickKeywordScan(comments);

  // If very few comments and no keyword hits, skip LLM call
  if (comments.length <= 3 && keywordMatches.length === 0) {
    return {
      sentimentScore: 0.5,
      trustFlag: "trusted",
      flaggedPhrases: [],
      totalComments: comments.length,
      negativeComments: 0,
      summary: "Too few comments for meaningful analysis. No red flags detected.",
    };
  }

  // Use Claude for nuanced analysis
  const analysisPrompt = buildAnalysisPrompt(comments);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    // Fallback to keyword-only analysis if LLM fails
    return keywordFallbackAnalysis(comments, keywordMatches);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) {
    return keywordFallbackAnalysis(comments, keywordMatches);
  }

  return parseAnalysisResponse(textBlock.text, comments.length);
}

/**
 * Quick keyword scan without LLM — catches obvious red flags.
 */
function quickKeywordScan(comments: string[]): string[] {
  const flagged: string[] = [];

  for (const comment of comments) {
    const lower = comment.toLowerCase();
    for (const keyword of TRUST_RED_FLAG_KEYWORDS) {
      if (lower.includes(keyword)) {
        flagged.push(comment);
        break;
      }
    }
  }

  return flagged;
}

/**
 * Build the analysis prompt for Claude.
 */
function buildAnalysisPrompt(comments: string[]): string {
  const commentList = comments
    .slice(0, 50) // Cap at 50 for token efficiency
    .map((c, i) => `${i + 1}. "${c}"`)
    .join("\n");

  return `Analyze these social media comments on a video post for trust/authenticity perception.

Determine if viewers perceive the video as genuine/authentic or as AI-generated/fake.

Comments:
${commentList}

Respond in this exact JSON format:
{
  "sentimentScore": <number -1.0 to 1.0, where -1 is very negative/suspicious, 1 is very positive/trusting>,
  "trustFlag": "<trusted|suspect|flagged>",
  "flaggedPhrases": [<array of specific comment excerpts that indicate distrust>],
  "negativeComments": <count of comments expressing distrust or calling out AI>,
  "summary": "<one sentence summarizing the audience perception>"
}

Rules:
- "trusted" = overwhelmingly positive or neutral, no AI accusations
- "suspect" = some questioning of authenticity (1-3 mentions) but not dominant
- "flagged" = significant portion of comments call out the content as fake/AI/bot
- Consider sarcasm and context — "this is so good it looks AI" is a compliment
- Only JSON, no other text`;
}

/**
 * Parse Claude's JSON response into a TrustAnalysisResult.
 */
function parseAnalysisResponse(
  text: string,
  totalComments: number
): TrustAnalysisResult {
  try {
    const parsed = JSON.parse(text) as {
      sentimentScore: number;
      trustFlag: string;
      flaggedPhrases: string[];
      negativeComments: number;
      summary: string;
    };

    return {
      sentimentScore: Math.max(-1, Math.min(1, parsed.sentimentScore)),
      trustFlag: validateTrustFlag(parsed.trustFlag),
      flaggedPhrases: parsed.flaggedPhrases ?? [],
      totalComments,
      negativeComments: parsed.negativeComments ?? 0,
      summary: parsed.summary ?? "Analysis complete.",
    };
  } catch {
    return {
      sentimentScore: 0,
      trustFlag: "suspect",
      flaggedPhrases: [],
      totalComments,
      negativeComments: 0,
      summary: "Could not parse analysis — review manually.",
    };
  }
}

function validateTrustFlag(
  flag: string
): "trusted" | "suspect" | "flagged" {
  if (flag === "trusted" || flag === "suspect" || flag === "flagged") {
    return flag;
  }
  return "suspect";
}

/**
 * Fallback analysis using keyword matching only (no LLM).
 */
function keywordFallbackAnalysis(
  comments: string[],
  flaggedComments: string[]
): TrustAnalysisResult {
  const ratio = flaggedComments.length / comments.length;

  let trustFlag: "trusted" | "suspect" | "flagged";
  let sentimentScore: number;

  if (ratio >= 0.2) {
    trustFlag = "flagged";
    sentimentScore = -0.7;
  } else if (ratio >= 0.05) {
    trustFlag = "suspect";
    sentimentScore = -0.3;
  } else {
    trustFlag = "trusted";
    sentimentScore = 0.3;
  }

  return {
    sentimentScore,
    trustFlag,
    flaggedPhrases: flaggedComments.slice(0, 5),
    totalComments: comments.length,
    negativeComments: flaggedComments.length,
    summary: `Keyword analysis: ${flaggedComments.length}/${comments.length} comments contain trust red flags.`,
  };
}
