import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Cloudflare bindings
const mockAll = vi.fn();
const mockFirst = vi.fn();
const mockRun = vi.fn();
const mockBind = vi.fn(() => ({
  all: mockAll,
  first: mockFirst,
  run: mockRun,
}));
const mockPrepare = vi.fn(() => ({
  bind: mockBind,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  prepare: mockPrepare,
};

vi.mock("@/lib/cloudflare/bindings", () => ({
  getDb: () => mockDb,
  getBindings: () => ({ DB: mockDb }),
}));

// Import after mocking
import { launchMission, cancelMission, toggleAgent } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockRun.mockResolvedValue({ meta: { changes: 1 } });
});

describe("launchMission", () => {
  it("inserts a mission record with planning status", async () => {
    const result = await launchMission("ws_123", "Grow revenue 20%");

    expect(result.missionId).toMatch(/^mission_/);
    expect(result.status).toBe("planning");
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO swarm_missions")
    );
  });

  it("passes workspace ID and JSON objective to D1", async () => {
    await launchMission("ws_abc", "Test goal", "conversion_rate", ["budget < 1k"]);

    expect(mockBind).toHaveBeenCalledWith(
      expect.stringMatching(/^mission_/),
      "ws_abc",
      expect.stringContaining("Test goal")
    );
    // Verify JSON includes optional fields
    const boundArgs = mockBind.mock.calls[0] as unknown[];
    const objective = JSON.parse(boundArgs[2] as string) as Record<string, unknown>;
    expect(objective["goal"]).toBe("Test goal");
    expect(objective["targetMetric"]).toBe("conversion_rate");
    expect(objective["constraints"]).toEqual(["budget < 1k"]);
  });

  it("generates unique mission IDs", async () => {
    const r1 = await launchMission("ws_1", "Goal A");
    const r2 = await launchMission("ws_1", "Goal B");
    expect(r1.missionId).not.toBe(r2.missionId);
  });
});

describe("cancelMission", () => {
  it("returns success when mission is cancelled", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } }); // UPDATE missions
    mockRun.mockResolvedValueOnce({ meta: { changes: 3 } }); // UPDATE tasks

    const result = await cancelMission("ws_123", "mission_abc");
    expect(result.success).toBe(true);
  });

  it("updates mission status to cancelled", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });
    mockRun.mockResolvedValueOnce({ meta: { changes: 0 } });

    await cancelMission("ws_123", "mission_abc");

    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'cancelled'")
    );
  });

  it("also skips queued/running tasks", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });
    mockRun.mockResolvedValueOnce({ meta: { changes: 2 } });

    await cancelMission("ws_123", "mission_abc");

    // Second call should update tasks
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'skipped'")
    );
  });

  it("returns failure when mission not found or not cancellable", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 0 } });

    const result = await cancelMission("ws_123", "nonexistent");
    expect(result.success).toBe(false);
  });

  it("validates workspace ownership in query", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });
    mockRun.mockResolvedValueOnce({ meta: { changes: 0 } });

    await cancelMission("ws_mine", "mission_abc");

    expect(mockBind).toHaveBeenCalledWith("mission_abc", "ws_mine");
  });
});

describe("toggleAgent", () => {
  it("activates an agent", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });

    const result = await toggleAgent("ws_123", "agent_1", true);
    expect(result.success).toBe(true);
    expect(mockBind).toHaveBeenCalledWith(1, "agent_1", "ws_123");
  });

  it("deactivates an agent", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });

    const result = await toggleAgent("ws_123", "agent_1", false);
    expect(result.success).toBe(true);
    expect(mockBind).toHaveBeenCalledWith(0, "agent_1", "ws_123");
  });

  it("returns failure when agent not found", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 0 } });

    const result = await toggleAgent("ws_123", "nonexistent", true);
    expect(result.success).toBe(false);
  });

  it("scopes toggle to workspace", async () => {
    mockRun.mockResolvedValueOnce({ meta: { changes: 1 } });

    await toggleAgent("ws_scoped", "agent_5", true);

    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("workspace_id = ?")
    );
    expect(mockBind).toHaveBeenCalledWith(1, "agent_5", "ws_scoped");
  });
});
