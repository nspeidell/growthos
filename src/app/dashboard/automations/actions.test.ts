import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionData } from "@/lib/auth/session";

// ─── Mock Setup ───

const mockSession: SessionData = {
  userId: "user_1",
  email: "owner@test.com",
  name: "Test Owner",
  avatarUrl: null,
  workspaceId: "ws_1",
  workspaceName: "Test Workspace",
  role: "owner",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  orderBy: vi.fn(() => mockDb),
  all: vi.fn(() => []),
  get: vi.fn(() => null),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => mockDb),
  run: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
  delete: vi.fn(() => mockDb),
};

vi.mock("@/lib/auth/middleware", () => ({
  requirePermission: vi.fn(() => Promise.resolve(mockSession)),
}));

vi.mock("@/lib/cloudflare/bindings", () => ({
  getBindings: vi.fn(() => ({ DB: {} })),
}));

vi.mock("@/lib/db/client", () => ({
  createDb: vi.fn(() => mockDb),
}));

vi.mock("@paralleldrive/cuid2", () => ({
  createId: vi.fn(() => "auto_mock_id"),
}));

import {
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "./actions";

describe("createAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({
      id: "auto_mock_id",
      workspaceId: "ws_1",
      name: "Test",
      triggerType: "subscribe",
      triggerConfig: null,
      steps: "[]",
      automationStatus: "draft",
      enrolledCount: 0,
      completedCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it("rejects missing name", async () => {
    const fd = new FormData();
    fd.set("name", "");
    fd.set("triggerType", "subscribe");
    fd.set("steps", "[]");

    const result = await createAutomation(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("VALIDATION");
    }
  });

  it("rejects invalid trigger type", async () => {
    const fd = new FormData();
    fd.set("name", "Valid Name");
    fd.set("triggerType", "invalid_trigger");
    fd.set("steps", "[]");

    const result = await createAutomation(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("VALIDATION");
    }
  });

  it("succeeds with valid trigger and steps", async () => {
    const fd = new FormData();
    fd.set("name", "Welcome Sequence");
    fd.set("triggerType", "subscribe");
    fd.set("steps", '[{"type": "send_email"}]');

    const result = await createAutomation(fd);
    expect(result.success).toBe(true);
  });

  it("accepts all valid trigger types", async () => {
    const triggers = ["subscribe", "tag_added", "lead_magnet", "manual"];
    for (const triggerType of triggers) {
      mockDb.get.mockResolvedValue({
        id: "auto_mock_id",
        workspaceId: "ws_1",
        name: "Test",
        triggerType,
        triggerConfig: null,
        steps: "[]",
        automationStatus: "draft",
        enrolledCount: 0,
        completedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const fd = new FormData();
      fd.set("name", `Test ${triggerType}`);
      fd.set("triggerType", triggerType);
      fd.set("steps", "[]");

      const result = await createAutomation(fd);
      expect(result.success).toBe(true);
    }
  });

  it("rejects name over 200 chars", async () => {
    const fd = new FormData();
    fd.set("name", "A".repeat(201));
    fd.set("triggerType", "manual");
    fd.set("steps", "[]");

    const result = await createAutomation(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("VALIDATION");
    }
  });
});

describe("toggleAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects if automation not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await toggleAutomation("ghost_id");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("rejects if automation belongs to different workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "auto_1",
      workspaceId: "ws_other",
      automationStatus: "active",
    });

    const result = await toggleAutomation("auto_1");
    expect(result.success).toBe(false);
  });

  it("toggles active to paused", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "auto_1",
      workspaceId: "ws_1",
      automationStatus: "active",
    });

    const result = await toggleAutomation("auto_1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.automationStatus).toBe("paused");
    }
  });

  it("toggles paused to active", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "auto_1",
      workspaceId: "ws_1",
      automationStatus: "paused",
    });

    const result = await toggleAutomation("auto_1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.automationStatus).toBe("active");
    }
  });
});

describe("deleteAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects if not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await deleteAutomation("ghost");
    expect(result.success).toBe(false);
  });

  it("rejects if wrong workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "auto_1",
      workspaceId: "ws_other",
    });

    const result = await deleteAutomation("auto_1");
    expect(result.success).toBe(false);
  });

  it("succeeds for valid automation in same workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "auto_1",
      workspaceId: "ws_1",
    });

    const result = await deleteAutomation("auto_1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deleted).toBe(true);
    }
  });
});
