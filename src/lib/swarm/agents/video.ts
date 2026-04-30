import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";

export class VideoAgent extends BaseAgent {
  readonly role = "video" as const;
  readonly name = "Video Producer";
  readonly capabilities: TaskType[] = ["generate_video"];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a short-form video production specialist. You create scripts, shot lists, and storyboards for TikTok, Reels, and Shorts. You understand hook-driven openings, pacing for retention, and CTA placement. You coordinate with the ElevenLabs voice engine for AI narration and suggest B-roll, text overlays, and transitions.`,
      context
    );

    const result = {
      script: {
        hook: `[Opening hook for: ${input.instruction}]`,
        body: `[Script body — 30-60s format]`,
        cta: `[Closing CTA]`,
        duration: "45s",
      },
      shotList: [
        { timestamp: "0-3s", type: "hook", description: "Pattern interrupt opening" },
        { timestamp: "3-30s", type: "body", description: "Core value delivery" },
        { timestamp: "30-45s", type: "cta", description: "Call to action with overlay" },
      ],
      voiceSettings: {
        provider: "elevenlabs",
        voiceId: "founder_default",
        speed: 1.1,
      },
    };

    return {
      result,
      summary: `Video script produced (${result.script.duration}) for: ${input.instruction}`,
      score: 0.78,
      tokensUsed: 1100,
      costCents: this.estimateCost(700, 400, context.modelProvider),
      artifacts: [
        {
          type: "media" as const,
          id: `video-script-${Date.now()}`,
          preview: result.script.hook,
        },
      ],
    };
  }
}
