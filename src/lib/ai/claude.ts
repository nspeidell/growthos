import { getBindings } from "@/lib/cloudflare/bindings";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeResponse {
  id: string;
  content: Array<{ type: "text"; text: string }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Send a message to Claude and get a text response.
 */
export async function generateWithClaude(options: {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const env = getBindings();

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured. Add it in Cloudflare Pages → Settings → Environment variables.");
  }

  // Debug logging removed — enable via Workers logpush if needed

  let response: Response;
  try {
    response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": CLAUDE_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        system: options.systemPrompt,
        messages: [{ role: "user", content: options.userMessage }],
      }),
    });
  } catch (fetchError) {
    console.error("[Claude] Fetch failed:", fetchError);
    throw new Error(`Failed to connect to Claude API: ${fetchError instanceof Error ? fetchError.message : "network error"}`);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Claude] API error ${response.status}:`, errorBody);
    throw new Error(
      `Claude API error ${response.status}: ${errorBody}`
    );
  }

  const data = (await response.json()) as ClaudeResponse;
  const textBlock = data.content.find((block) => block.type === "text");

  if (!textBlock) {
    throw new Error("No text response from Claude");
  }

  return textBlock.text;
}

/**
 * Generate multiple content variations in a single call.
 * Claude returns JSON with an array of variations.
 */
export async function generateVariations(options: {
  systemPrompt: string;
  userMessage: string;
  count: number;
}): Promise<string[]> {
  const result = await generateWithClaude({
    systemPrompt: options.systemPrompt,
    userMessage: `${options.userMessage}\n\nGenerate exactly ${options.count} variations. Return ONLY a JSON array of strings, no other text. Example: ["variation 1", "variation 2"]`,
    temperature: 0.8,
  });

  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in response");
    }
    const parsed = JSON.parse(jsonMatch[0]) as string[];
    return parsed;
  } catch (error) {
    // If parsing fails, return the raw response as a single item
    console.warn("[claude] Failed to parse variations JSON, returning raw response", error);
    return [result];
  }
}
