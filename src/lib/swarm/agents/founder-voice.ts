import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class FounderVoiceAgent extends BaseAgent {
  readonly role = "founder_voice" as const;
  readonly name = "Founder Voice";
  readonly capabilities: TaskType[] = [
    "review_brand_voice",
    "generate_content",
  ];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a brand voice guardian and founder ghostwriter. You study the founder's writing style — their cadence, vocabulary, opinions, and storytelling patterns — and produce content that is indistinguishable from their authentic voice. You review other agents' content for voice consistency and flag anything that sounds corporate, generic, or off-brand. You prioritize authenticity over polish.`,
      context
    );

    const result = {
      taskType,
      instruction: input.instruction,
      voiceProfile: {
        tone: "conversational-authority",
        vocabulary: "accessible-technical",
        signatures: [
          "Opens with a contrarian take",
          "Uses short punchy paragraphs",
          "Ends with a provocative question",
        ],
      },
      output:
        taskType === "review_brand_voice"
          ? {
              review: {
                voiceMatchScore: 0.72,
                flags: [
                  "Paragraph 2 sounds too corporate — simplify",
                  "CTA feels generic — add founder's personal angle",
                ],
                rewrite: `[Voice-corrected version of: ${input.instruction}]`,
              },
            }
          : {
              content: `[Founder-voice content for: ${input.instruction}]`,
              platforms: ["linkedin", "twitter"],
              voiceMatchScore: 0.91,
            },
    };

    return {
      result,
      summary: `${taskType === "review_brand_voice" ? "Voice review" : "Founder-voice content"} completed for: ${input.instruction}`,
      score: taskType === "review_brand_voice" ? 0.90 : 0.85,
      tokensUsed: 1200,
      costCents: this.estimateCost(800, 400, context.modelProvider),
      artifacts: [
        {
          type: "content" as const,
          id: `founder-voice-${Date.now()}`,
          preview: `Voice match: ${taskType === "review_brand_voice" ? "72%" : "91%"}`,
        },
      ],
    };
  }
}
