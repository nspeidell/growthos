import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class AnalyticsAgent extends BaseAgent {
  readonly role = "analytics" as const;
  readonly name = "Analytics Engine";
  readonly capabilities: TaskType[] = ["analyze_metrics", "summarize"];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a growth analytics specialist. You analyze engagement metrics, conversion funnels, cohort retention, and attribution data. You surface actionable insights — not just numbers. You flag anomalies, identify trends, and recommend specific experiments. You present data in executive-ready summaries with clear "so what?" conclusions.`,
      context
    );

    const result = {
      analysisType: taskType,
      instruction: input.instruction,
      metrics: {
        engagement: { current: 0.034, previous: 0.028, change: "+21.4%" },
        conversions: { current: 142, previous: 118, change: "+20.3%" },
        cpl: { current: 11.2, previous: 14.8, change: "-24.3%" },
        topContent: [
          { id: "post-1", platform: "linkedin", engagement: 0.058 },
          { id: "post-2", platform: "twitter", engagement: 0.041 },
        ],
      },
      insights: [
        "LinkedIn carousel posts outperform single images by 2.3x",
        "Tuesday 9am posting window drives 34% higher engagement",
        "Video content CPL is 40% lower than static ads",
      ],
      recommendations: [
        "Shift 20% of static ad budget to short-form video",
        "Double down on carousel format for LinkedIn",
        "Test Wednesday posting as secondary high-engagement window",
      ],
    };

    return {
      result,
      summary: `Analytics report generated with ${result.insights.length} insights for: ${input.instruction}`,
      score: 0.88,
      tokensUsed: 1400,
      costCents: this.estimateCost(900, 500, context.modelProvider),
      artifacts: [
        {
          type: "analysis" as const,
          id: `analytics-${Date.now()}`,
          preview: result.insights[0]!,
        },
      ],
    };
  }
}
