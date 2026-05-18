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
  leftJoin: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  orderBy: vi.fn(() => mockDb),
  all: vi.fn(() => []),
  get: vi.fn(() => null),
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
};

vi.mock("@/lib/auth/middleware", () => ({
  requirePermission: vi.fn(() => Promise.resolve(mockSession)),
  AuthError: class AuthError extends Error {
    constructor(message = "Authentication required") {
      super(message);
      this.name = "AuthError";
    }
  },
  PermissionError: class PermissionError extends Error {
    constructor(message = "Insufficient permissions") {
      super(message);
      this.name = "PermissionError";
    }
  },
}));

vi.mock("@/lib/cloudflare/bindings", () => ({
  getBindings: vi.fn(() => ({ DB: {} })),
}));

vi.mock("@/lib/db/client", () => ({
  createDb: vi.fn(() => mockDb),
}));

import { getPostsByDateRange, reschedulePost } from "./actions";

describe("getPostsByDateRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.all.mockResolvedValue([]);
  });

  it("returns empty array when no posts found", async () => {
    mockDb.all.mockResolvedValue([]);

    const result = await getPostsByDateRange(
      Date.now() - 86400000,
      Date.now()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it("truncates body to 120 characters", async () => {
    const longBody = "A".repeat(200);
    mockDb.all.mockResolvedValue([
      {
        id: "post_1",
        platform: "instagram",
        postStatus: "queued",
        scheduledFor: new Date(),
        body: longBody,
        connectedAccountId: "acc_1",
      },
    ]);

    const result = await getPostsByDateRange(
      Date.now() - 86400000,
      Date.now()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]!.body).toHaveLength(120);
    }
  });

  it("handles null body gracefully", async () => {
    mockDb.all.mockResolvedValue([
      {
        id: "post_1",
        platform: "x",
        postStatus: "draft",
        scheduledFor: new Date(),
        body: null,
        connectedAccountId: "acc_1",
      },
    ]);

    const result = await getPostsByDateRange(
      Date.now() - 86400000,
      Date.now()
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]!.body).toBe("");
    }
  });
});

describe("reschedulePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects if post not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await reschedulePost("ghost_post", Date.now());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("rejects if post belongs to different workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_other",
      postStatus: "queued",
    });

    const result = await reschedulePost("post_1", Date.now());
    expect(result.success).toBe(false);
  });

  it("rejects rescheduling a published post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "published",
    });

    const result = await reschedulePost("post_1", Date.now());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("published");
    }
  });

  it("rejects rescheduling a post currently publishing", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "publishing",
    });

    const result = await reschedulePost("post_1", Date.now());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("published");
    }
  });

  it("succeeds for queued post in same workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "queued",
    });

    const newDate = Date.now() + 86400000;
    const result = await reschedulePost("post_1", newDate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(true);
    }
  });

  it("succeeds for draft post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_2",
      workspaceId: "ws_1",
      postStatus: "draft",
    });

    const result = await reschedulePost("post_2", Date.now() + 3600000);
    expect(result.success).toBe(true);
  });
});
