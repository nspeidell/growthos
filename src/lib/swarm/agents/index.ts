/**
 * Agent registry — barrel export for all specialist agents.
 */

export { BaseAgent } from "./base-agent";
export type { AgentContext } from "./base-agent";

export { StrategistAgent } from "./strategist";
export { ContentAgent } from "./content";
export { VideoAgent } from "./video";
export { AdsAgent } from "./ads";
export { OutreachAgent } from "./outreach";
export { AnalyticsAgent } from "./analytics";
export { CompetitorAgent } from "./competitor";
export { FounderVoiceAgent } from "./founder-voice";

import { StrategistAgent } from "./strategist";
import { ContentAgent } from "./content";
import { VideoAgent } from "./video";
import { AdsAgent } from "./ads";
import { OutreachAgent } from "./outreach";
import { AnalyticsAgent } from "./analytics";
import { CompetitorAgent } from "./competitor";
import { FounderVoiceAgent } from "./founder-voice";
import type { BaseAgent } from "./base-agent";
import type { AgentRole } from "../types";

/**
 * Create an agent instance by role.
 */
export function createAgent(role: AgentRole): BaseAgent {
  const registry: Record<AgentRole, () => BaseAgent> = {
    strategist: () => new StrategistAgent(),
    content: () => new ContentAgent(),
    video: () => new VideoAgent(),
    ads: () => new AdsAgent(),
    outreach: () => new OutreachAgent(),
    analytics: () => new AnalyticsAgent(),
    competitor: () => new CompetitorAgent(),
    founder_voice: () => new FounderVoiceAgent(),
  };

  const factory = registry[role];
  if (!factory) {
    throw new Error(`Unknown agent role: ${role}`);
  }
  return factory();
}

/**
 * Get all available agent instances.
 */
export function getAllAgents(): BaseAgent[] {
  return [
    new StrategistAgent(),
    new ContentAgent(),
    new VideoAgent(),
    new AdsAgent(),
    new OutreachAgent(),
    new AnalyticsAgent(),
    new CompetitorAgent(),
    new FounderVoiceAgent(),
  ];
}
