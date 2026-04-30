import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class CompetitorAgent extends BaseAgent {
  readonly role = "competitor" as const;
  readonly name = "Competitor Intel";
  readonly capabilities: TaskType[] = ["research_competitors", "summarize"];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a competitive intelligence analyst. You monitor competitor content strategies, ad spend patterns, messaging pivots, and market positioning. You identify gaps and opportunities the team can exploit. You deliver structured briefs with specific tactical recommendations, not generic observations.`,
      context
    );

    const result = {
      instruction: input.instruction,
      competitors: [
        {
          name: "[Competitor A]",
          recentMoves: [
            "Launched video-first campaign on TikTok",
            "Shifted messaging toward enterprise segment",
          ],
          contentFrequency: "12 posts/week across 3 platforms",
          estimatedAdSpend: "$15K-25K/month",
          strengths: ["Strong brand recognition", "High production quality"],
          weaknesses: ["Low engagement on LinkedIn", "No community strategy"],
        },
      ],
      opportunities: [
        "Competitor A ignoring Reddit — untapped channel",
        "Gap in educational content for SMB segment",
        "Their response time on social is 4+ hours — we can win on speed",
      ],
      threatLevel: "medium",
    };

    return {
      result,
      summary: `Competitive analysis completed (${result.competitors.length} competitors, ${result.opportunities.length} opportunities) for: ${input.instruction}`,
      score: 0.83,
      tokensUsed: 1600,
      costCents: this.estimateCost(1000, 600, context.modelProvider),
      artifacts: [
        {
          type: "analysis" as const,
          id: `competitor-intel-${Date.now()}`,
          preview: result.opportunities[0]!,
        },
      ],
    };
  }
}
