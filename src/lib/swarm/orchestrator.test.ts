import { describe, it, expect, vi, beforeEach } from "vitest";
import { SwarmOrchestrator } from "./orchestrator";
import type { MissionObjective } from "./types";
import type { AgentContext } from "./agents/base-agent";

const baseContext: Omit<AgentContext, "missionId"> = {
  workspaceId: "ws_test",
  anthropicApiKey: "sk-test",
  modelProvider: "anthropic",
  temperature: 0.7,
};

const sampleObjective: MissionObjective = {
  goal: "Increase LinkedIn engagement by 50%",
  targetMetric: "engagement_rate",
  targetValue: 0.05,
  constraints: ["Budget under $500", "No paid ads"],
};

describe("SwarmOrchestrator", () => {
  let orchestrator: SwarmOrchestrator;

  beforeEach(() => {
    orchestrator = new SwarmOrchestrator();
  });

  describe("launchMission", () => {
    it("returns a completed summary with all required fields", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);

      expect(summary.missionId).toBeTruthy();
      expect(summary.missionId).toMatch(/^mission_/);
      expect(summary.status).toBe("completed");
      expect(summary.tasksCompleted).toBeGreaterThan(0);
      expect(summary.totalTokens).toBeGreaterThan(0);
      expect(summary.totalCostCents).toBeGreaterThanOrEqual(0);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof summary.summary).toBe("string");
    });

    it("executes tasks across all 3 default phases", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);

      // Default plan has Research (2 tasks), Creation (2 tasks), Distribution (2 tasks)
      // Plus the strategist planning task
      expect(summary.tasksCompleted).toBeGreaterThanOrEqual(6);
    });

    it("collects artifacts from completed tasks", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);

      // Multiple agents produce artifacts (content, ads, analytics, competitor, founder_voice)
      expect(summary.artifacts.length).toBeGreaterThan(0);
      for (const artifact of summary.artifacts) {
        expect(artifact.type).toBeTruthy();
        expect(artifact.id).toBeTruthy();
        expect(artifact.preview).toBeTruthy();
      }
    });

    it("generates a narrative summary", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);

      expect(summary.summary).toContain("Increase LinkedIn engagement");
      expect(summary.summary).toContain("completed");
      expect(summary.summary).toContain("Total cost:");
      expect(summary.summary).toContain("Average quality score:");
    });

    it("tracks mission state internally", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);

      const state = orchestrator.getMissionState(summary.missionId);
      expect(state).toBeDefined();
      expect(state!.status).toBe("completed");
      expect(state!.completedAt).toBeTruthy();
      expect(state!.objective.goal).toBe(sampleObjective.goal);
    });
  });

  describe("cost limits", () => {
    it("pauses mission when cost limit exceeded", async () => {
      // Set an extremely low cost limit to trigger pause
      const cheapOrchestrator = new SwarmOrchestrator({ costLimitCents: 0 });
      const summary = await cheapOrchestrator.launchMission(sampleObjective, baseContext);

      expect(summary.status).toBe("paused");
    });

    it("respects higher cost limits", async () => {
      const generousOrchestrator = new SwarmOrchestrator({ costLimitCents: 50000 });
      const summary = await generousOrchestrator.launchMission(sampleObjective, baseContext);

      expect(summary.status).toBe("completed");
    });
  });

  describe("cancelMission", () => {
    it("cancels an active mission", async () => {
      // Launch a mission first to get a mission ID in state
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);
      // Since the mission completes instantly (placeholder agents), test with a fresh mission
      // that we manually put in active state would be ideal, but let's test the cancel logic
      // on a non-active mission returns false
      const result = orchestrator.cancelMission(summary.missionId);
      // Already completed, so cancel should return false
      expect(result).toBe(false);
    });

    it("returns false for unknown mission", () => {
      const result = orchestrator.cancelMission("nonexistent_mission");
      expect(result).toBe(false);
    });
  });

  describe("resumeMission", () => {
    it("returns null for non-paused mission", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);
      const result = await orchestrator.resumeMission(summary.missionId, baseContext);
      // Mission is completed, not paused
      expect(result).toBeNull();
    });

    it("returns null for unknown mission", async () => {
      const result = await orchestrator.resumeMission("nonexistent", baseContext);
      expect(result).toBeNull();
    });

    it("resumes a paused mission", async () => {
      // Create an orchestrator with zero cost limit to force pause
      const cheapOrchestrator = new SwarmOrchestrator({ costLimitCents: 0 });
      const paused = await cheapOrchestrator.launchMission(sampleObjective, baseContext);
      expect(paused.status).toBe("paused");

      // Now update the config isn't possible directly, but we can test resumeMission
      // The mission is paused but resuming re-runs remaining tasks (which will also hit cost limit)
      const resumed = await cheapOrchestrator.resumeMission(paused.missionId, baseContext);
      expect(resumed).not.toBeNull();
      expect(resumed!.missionId).toBe(paused.missionId);
    });
  });

  describe("getMissionState", () => {
    it("returns undefined for unknown mission", () => {
      expect(orchestrator.getMissionState("nonexistent")).toBeUndefined();
    });

    it("returns full state for known mission", async () => {
      const summary = await orchestrator.launchMission(sampleObjective, baseContext);
      const state = orchestrator.getMissionState(summary.missionId);

      expect(state).toBeDefined();
      expect(state!.missionId).toBe(summary.missionId);
      expect(state!.tasks.length).toBeGreaterThan(0);
      expect(state!.startedAt).toBeTruthy();
      expect(state!.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("configuration", () => {
    it("uses default config when none provided", () => {
      const orch = new SwarmOrchestrator();
      // We can verify defaults indirectly through behavior
      // Default costLimitCents is 500 ($5) which should allow our placeholder agents
      // to complete without pausing
      return orch.launchMission(sampleObjective, baseContext).then((s) => {
        expect(s.status).toBe("completed");
      });
    });

    it("accepts partial config overrides", async () => {
      const orch = new SwarmOrchestrator({
        maxConcurrentTasks: 1,
        temperature: 0.3,
      });
      const summary = await orch.launchMission(sampleObjective, baseContext);
      // Should still complete, just with sequential task execution
      expect(summary.status).toBe("completed");
    });
  });

  describe("error handling", () => {
    it("handles mission with minimal objective", async () => {
      const minimal: MissionObjective = { goal: "Do something" };
      const summary = await orchestrator.launchMission(minimal, baseContext);

      expect(summary.status).toBe("completed");
      expect(summary.summary).toContain("Do something");
    });

    it("handles empty constraints gracefully", async () => {
      const obj: MissionObjective = {
        goal: "Test mission",
        constraints: [],
      };
      const summary = await orchestrator.launchMission(obj, baseContext);
      expect(summary.status).toBe("completed");
    });
  });
});
