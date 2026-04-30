import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class OutreachAgent extends BaseAgent {
  readonly role = "outreach" as const;
  readonly name = "Outreach Specialist";
  readonly capabilities: TaskType[] = ["send_outreach"];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are an outreach and relationship-building specialist. You craft personalized cold emails, LinkedIn DMs, partnership proposals, and influencer collaboration pitches. You understand reply-rate optimization, follow-up cadences, and personalization at scale. You never sound templated — every message feels hand-written.`,
      context
    );

    const result = {
      instruction: input.instruction,
      sequences: [
        {
          name: "Initial Outreach",
          channel: "email",
          steps: [
            { day: 0, type: "intro", subject: `[Personalized subject for: ${input.instruction}]` },
            { day: 3, type: "follow_up", subject: "Quick follow-up" },
            { day: 7, type: "value_add", subject: "Thought you'd find this useful" },
            { day: 14, type: "breakup", subject: "Last note from me" },
          ],
        },
      ],
      personalizationFields: ["first_name", "company", "recent_post", "mutual_connection"],
      projectedReplyRate: 0.12,
    };

    return {
      result,
      summary: `Outreach sequence created (${result.sequences[0]!.steps.length} steps) for: ${input.instruction}`,
      score: 0.75,
      tokensUsed: 1000,
      costCents: this.estimateCost(600, 400, context.modelProvider),
    };
  }
}
