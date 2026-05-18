import { describe, it, expect, vi } from "vitest";

// ContentAgent calls generateWithClaude at runtime; mock it so tests
// don't require a live API key and always return a stable string.
vi.mock("@/lib/ai/claude", () => ({
  generateWithClaude: vi.fn(() =>
    Promise.resolve("This is mock generated content for testing purposes.")
  ),
}));

import { createAgent, getAllAgents } from "./index";
import { StrategistAgent } from "./strategist";
import { ContentAgent } from "./content";
import { VideoAgent } from "./video";
import { AdsAgent } from "./ads";
import { OutreachAgent } from "./outreach";
import { AnalyticsAgent } from "./analytics";
import { CompetitorAgent } from "./competitor";
import { FounderVoiceAgent } from "./founder-voice";
import type { AgentRole, TaskType } from "../types";
import type { AgentContext } from "./base-agent";

const ALL_ROLES: AgentRole[] = [
  "strategist",
  "content",
  "video",
  "ads",
  "outreach",
  "analytics",
  "competitor",
  "founder_voice",
];

const mockContext: AgentContext = {
  workspaceId: "ws_test",
  missionId: "mission_test",
  anthropicApiKey: "sk-test",
  modelProvider: "anthropic",
  temperature: 0.7,
};

describe("createAgent", () => {
  it("creates an agent for every valid role", () => {
    for (const role of ALL_ROLES) {
      const agent = createAgent(role);
      expect(agent).toBeDefined();
      expect(agent.role).toBe(role);
    }
  });

  it("returns the correct class for each role", () => {
    expect(createAgent("strategist")).toBeInstanceOf(StrategistAgent);
    expect(createAgent("content")).toBeInstanceOf(ContentAgent);
    expect(createAgent("video")).toBeInstanceOf(VideoAgent);
    expect(createAgent("ads")).toBeInstanceOf(AdsAgent);
    expect(createAgent("outreach")).toBeInstanceOf(OutreachAgent);
    expect(createAgent("analytics")).toBeInstanceOf(AnalyticsAgent);
    expect(createAgent("competitor")).toBeInstanceOf(CompetitorAgent);
    expect(createAgent("founder_voice")).toBeInstanceOf(FounderVoiceAgent);
  });

  it("throws for unknown role", () => {
    expect(() => createAgent("nonexistent" as AgentRole)).toThrow(
      "Unknown agent role: nonexistent"
    );
  });
});

describe("getAllAgents", () => {
  it("returns all 8 agents", () => {
    const agents = getAllAgents();
    expect(agents).toHaveLength(8);
  });

  it("includes every role exactly once", () => {
    const agents = getAllAgents();
    const roles = agents.map((a) => a.role).sort();
    expect(roles).toEqual([...ALL_ROLES].sort());
  });

  it("every agent has a non-empty name", () => {
    for (const agent of getAllAgents()) {
      expect(agent.name).toBeTruthy();
      expect(typeof agent.name).toBe("string");
    }
  });

  it("every agent has at least one capability", () => {
    for (const agent of getAllAgents()) {
      expect(agent.capabilities.length).toBeGreaterThan(0);
    }
  });
});

describe("canHandle", () => {
  it("strategist handles plan_strategy, summarize, recommend", () => {
    const agent = createAgent("strategist");
    expect(agent.canHandle("plan_strategy")).toBe(true);
    expect(agent.canHandle("summarize")).toBe(true);
    expect(agent.canHandle("recommend")).toBe(true);
    expect(agent.canHandle("generate_content")).toBe(false);
    expect(agent.canHandle("optimize_ads")).toBe(false);
  });

  it("content handles generate_content, review_brand_voice, schedule_post", () => {
    const agent = createAgent("content");
    expect(agent.canHandle("generate_content")).toBe(true);
    expect(agent.canHandle("review_brand_voice")).toBe(true);
    expect(agent.canHandle("schedule_post")).toBe(true);
    expect(agent.canHandle("optimize_ads")).toBe(false);
  });

  it("video handles only generate_video", () => {
    const agent = createAgent("video");
    expect(agent.canHandle("generate_video")).toBe(true);
    expect(agent.canHandle("generate_content")).toBe(false);
  });

  it("ads handles create_campaign and optimize_ads", () => {
    const agent = createAgent("ads");
    expect(agent.canHandle("create_campaign")).toBe(true);
    expect(agent.canHandle("optimize_ads")).toBe(true);
    expect(agent.canHandle("generate_content")).toBe(false);
  });

  it("outreach handles only send_outreach", () => {
    const agent = createAgent("outreach");
    expect(agent.canHandle("send_outreach")).toBe(true);
    expect(agent.canHandle("create_campaign")).toBe(false);
  });

  it("analytics handles analyze_metrics and summarize", () => {
    const agent = createAgent("analytics");
    expect(agent.canHandle("analyze_metrics")).toBe(true);
    expect(agent.canHandle("summarize")).toBe(true);
    expect(agent.canHandle("plan_strategy")).toBe(false);
  });

  it("competitor handles research_competitors and summarize", () => {
    const agent = createAgent("competitor");
    expect(agent.canHandle("research_competitors")).toBe(true);
    expect(agent.canHandle("summarize")).toBe(true);
    expect(agent.canHandle("send_outreach")).toBe(false);
  });

  it("founder_voice handles review_brand_voice and generate_content", () => {
    const agent = createAgent("founder_voice");
    expect(agent.canHandle("review_brand_voice")).toBe(true);
    expect(agent.canHandle("generate_content")).toBe(true);
    expect(agent.canHandle("optimize_ads")).toBe(false);
  });

  it("no agent handles a completely invalid task type", () => {
    for (const agent of getAllAgents()) {
      expect(agent.canHandle("invalid_task" as TaskType)).toBe(false);
    }
  });
});

describe("agent execution", () => {
  it("strategist returns structured output with required fields", async () => {
    const agent = createAgent("strategist");
    const output = await agent.execute(
      "plan_strategy",
      { instruction: "Grow LinkedIn following by 50%" },
      mockContext
    );
    expect(output.summary).toBeTruthy();
    expect(output.tokensUsed).toBeGreaterThan(0);
    expect(output.costCents).toBeGreaterThanOrEqual(0);
    expect(typeof output.result).toBe("object");
  });

  it("content returns artifacts array", async () => {
    const agent = createAgent("content");
    const output = await agent.execute(
      "generate_content",
      { instruction: "Write a product launch announcement" },
      mockContext
    );
    expect(output.artifacts).toBeDefined();
    expect(output.artifacts!.length).toBeGreaterThan(0);
    expect(output.artifacts![0]!.type).toBe("content");
  });

  it("video returns media artifact", async () => {
    const agent = createAgent("video");
    const output = await agent.execute(
      "generate_video",
      { instruction: "Create a 30s product demo" },
      mockContext
    );
    expect(output.artifacts).toBeDefined();
    expect(output.artifacts![0]!.type).toBe("media");
  });

  it("ads returns campaign artifact", async () => {
    const agent = createAgent("ads");
    const output = await agent.execute(
      "create_campaign",
      { instruction: "Launch retargeting campaign" },
      mockContext
    );
    expect(output.artifacts).toBeDefined();
    expect(output.artifacts![0]!.type).toBe("campaign");
  });

  it("analytics returns analysis artifact", async () => {
    const agent = createAgent("analytics");
    const output = await agent.execute(
      "analyze_metrics",
      { instruction: "Analyze Q1 performance" },
      mockContext
    );
    expect(output.artifacts).toBeDefined();
    expect(output.artifacts![0]!.type).toBe("analysis");
  });

  it("competitor returns analysis artifact", async () => {
    const agent = createAgent("competitor");
    const output = await agent.execute(
      "research_competitors",
      { instruction: "Analyze top 3 competitors" },
      mockContext
    );
    expect(output.artifacts).toBeDefined();
    expect(output.artifacts![0]!.type).toBe("analysis");
  });

  it("founder_voice returns content artifact", async () => {
    const agent = createAgent("founder_voice");
    const output = await agent.execute(
      "review_brand_voice",
      { instruction: "Review latest blog draft" },
      mockContext
    );
    expect(output.artifacts).toBeDefined();
    expect(output.artifacts![0]!.type).toBe("content");
  });

  it("outreach returns no artifacts (sequence-only)", async () => {
    const agent = createAgent("outreach");
    const output = await agent.execute(
      "send_outreach",
      { instruction: "Reach out to 10 leads" },
      mockContext
    );
    expect(output.artifacts).toBeUndefined();
    expect(output.summary).toContain("Outreach sequence");
  });

  it("cost estimation varies by provider", async () => {
    const agent = createAgent("strategist");

    const anthropicOutput = await agent.execute(
      "plan_strategy",
      { instruction: "test" },
      { ...mockContext, modelProvider: "anthropic" }
    );
    const cloudflareOutput = await agent.execute(
      "plan_strategy",
      { instruction: "test" },
      { ...mockContext, modelProvider: "cloudflare" }
    );

    // Cloudflare rates are much lower, so cost should be lower
    expect(cloudflareOutput.costCents).toBeLessThan(anthropicOutput.costCents);
  });
});
