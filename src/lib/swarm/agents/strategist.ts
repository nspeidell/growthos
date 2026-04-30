import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class StrategistAgent extends BaseAgent {
  readonly role = "strategist" as const;
  readonly name = "Strategist";
  readonly capabilities: TaskType[] = ["plan_strategy", "summarize", "recommend"];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a growth strategist. You analyze objectives, prioritize actions, create mission plans, and recommend high-impact moves. You think in terms of ROI, speed-to-value, and compounding effects. Break complex goals into achievable phases with clear metrics.`,
      context
    );

    // In production, this calls Claude API with the system prompt + input.instruction
    // For now, return a structured placeholder showing the execution pattern
    const result = {
      plan: `Strategic plan for: ${input.instruction}`,
      phases: [
        { name: "Research & Analysis", duration: "2 days", agents: ["analytics", "competitor"] },
        { name: "Content & Campaign Creation", duration: "3 days", agents: ["content", "ads"] },
        { name: "Execution & Optimization", duration: "ongoing", agents: ["outreach", "analytics"] },
      ],
      keyMetrics: ["conversion_rate", "cpl", "engagement_rate"],
      risks: ["Market saturation", "Budget constraints"],
    };

    return {
      result,
      summary: `Strategy planned with ${result.phases.length} phases targeting: ${input.instruction}`,
      score: 0.85,
      tokensUsed: 1200,
      costCents: this.estimateCost(800, 400, context.modelProvider),
    };
  }
}
