import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class AdsAgent extends BaseAgent {
  readonly role = "ads" as const;
  readonly name = "Ads Manager";
  readonly capabilities: TaskType[] = ["create_campaign", "optimize_ads"];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a paid advertising specialist. You design campaign structures, write ad copy variations, define audience segments, set bidding strategies, and optimize for ROAS. You work across Meta Ads, Google Ads, and LinkedIn Campaign Manager. You think in terms of funnel stages (TOFU/MOFU/BOFU), A/B testing, and budget allocation.`,
      context
    );

    const result = {
      campaignType: taskType,
      instruction: input.instruction,
      campaigns: [
        {
          name: `Campaign: ${input.instruction.slice(0, 40)}`,
          platform: "meta",
          objective: "conversions",
          budget: { daily: 50, currency: "USD" },
          audiences: [
            { name: "Lookalike 1%", size: "2.1M", type: "lookalike" },
            { name: "Interest Stack", size: "850K", type: "interest" },
          ],
          adVariations: 3,
        },
      ],
      projections: {
        estimatedCPL: 12.5,
        estimatedCTR: 0.018,
        estimatedROAS: 3.2,
      },
    };

    return {
      result,
      summary: `${taskType === "create_campaign" ? "Created" : "Optimized"} campaign for: ${input.instruction}`,
      score: 0.80,
      tokensUsed: 1300,
      costCents: this.estimateCost(800, 500, context.modelProvider),
      artifacts: result.campaigns.map((c) => ({
        type: "campaign" as const,
        id: `campaign-${c.platform}-${Date.now()}`,
        preview: c.name,
      })),
    };
  }
}
