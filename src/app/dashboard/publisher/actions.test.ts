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
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
  delete: vi.fn(() => mockDb),
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

vi.mock("@paralleldrive/cuid2", () => ({
  createId: vi.fn(() => "post_mock_id"),
}));

import {
  schedulePost,
  approvePost,
  cancelPost,
  reschedulePost,
  listScheduledPosts,
} from "./actions";

describe("schedulePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects missing contentAssetId", async () => {
    const fd = new FormData();
    fd.set("contentAssetId", "");
    fd.set("connectedAccountId", "acc_1");
    fd.set("scheduledFor", new Date(Date.now() + 3600000).toISOString());

    const result = await schedulePost(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects non-datetime scheduledFor", async () => {
    const fd = new FormData();
    fd.set("contentAssetId", "asset_1");
    fd.set("connectedAccountId", "acc_1");
    fd.set("scheduledFor", "not-a-date");

    const result = await schedulePost(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects when content asset not found", async () => {
    mockDb.get.mockResolvedValueOnce(null); // asset not found

    const fd = new FormData();
    fd.set("contentAssetId", "ghost_asset");
    fd.set("connectedAccountId", "acc_1");
    fd.set("scheduledFor", new Date(Date.now() + 3600000).toISOString());

    const result = await schedulePost(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Content asset not found");
  });

  it("rejects when connected account not found", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "asset_1", body: "Content" }) // asset found
      .mockResolvedValueOnce(null); // account not found

    const fd = new FormData();
    fd.set("contentAssetId", "asset_1");
    fd.set("connectedAccountId", "ghost_acc");
    fd.set("scheduledFor", new Date(Date.now() + 3600000).toISOString());

    const result = await schedulePost(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Connected account not found");
  });

  it("rejects when account is disconnected", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "asset_1", body: "Content" })
      .mockResolvedValueOnce({
        id: "acc_1",
        workspaceId: "ws_1",
        accountStatus: "disconnected",
        platform: "instagram",
      });

    const fd = new FormData();
    fd.set("contentAssetId", "asset_1");
    fd.set("connectedAccountId", "acc_1");
    fd.set("scheduledFor", new Date(Date.now() + 3600000).toISOString());

    const result = await schedulePost(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("disconnected");
  });

  it("creates post with draft status when manual approval", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "asset_1", body: "Content", platform: "instagram" })
      .mockResolvedValueOnce({
        id: "acc_1",
        workspaceId: "ws_1",
        accountStatus: "active",
        platform: "instagram",
      });

    const fd = new FormData();
    fd.set("contentAssetId", "asset_1");
    fd.set("connectedAccountId", "acc_1");
    fd.set("scheduledFor", new Date(Date.now() + 3600000).toISOString());
    fd.set("approvalMode", "manual");

    const result = await schedulePost(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.postStatus).toBe("draft");
    }
  });

  it("creates post with queued status when autonomous", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "asset_1", body: "Content", platform: "x" })
      .mockResolvedValueOnce({
        id: "acc_1",
        workspaceId: "ws_1",
        accountStatus: "active",
        platform: "x",
      });

    const fd = new FormData();
    fd.set("contentAssetId", "asset_1");
    fd.set("connectedAccountId", "acc_1");
    fd.set("scheduledFor", new Date(Date.now() + 3600000).toISOString());
    fd.set("approvalMode", "autonomous");

    const result = await schedulePost(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.postStatus).toBe("queued");
    }
  });
});

describe("approvePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects post not found or in wrong workspace", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await approvePost("ghost_post");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("rejects approving non-draft post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "queued",
    });

    const result = await approvePost("post_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Cannot approve");
  });

  it("approves a draft post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "draft",
    });

    const result = await approvePost("post_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.approved).toBe(true);
  });
});

describe("cancelPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects post not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await cancelPost("ghost");
    expect(result.success).toBe(false);
  });

  it("rejects cancelling a published post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "published",
    });

    const result = await cancelPost("post_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already published");
  });

  it("rejects cancelling a post currently publishing", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "publishing",
    });

    const result = await cancelPost("post_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("currently publishing");
  });

  it("cancels a queued post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "queued",
    });

    const result = await cancelPost("post_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cancelled).toBe(true);
  });

  it("cancels a draft post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "draft",
    });

    const result = await cancelPost("post_1");
    expect(result.success).toBe(true);
  });
});

describe("reschedulePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects post not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await reschedulePost("ghost", new Date(Date.now() + 3600000).toISOString());
    expect(result.success).toBe(false);
  });

  it("rejects rescheduling published post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "published",
    });

    const result = await reschedulePost("post_1", new Date(Date.now() + 3600000).toISOString());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("published");
  });

  it("rejects rescheduling publishing post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "publishing",
    });

    const result = await reschedulePost("post_1", new Date(Date.now() + 3600000).toISOString());
    expect(result.success).toBe(false);
  });

  it("reschedules a queued post", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "post_1",
      workspaceId: "ws_1",
      postStatus: "queued",
    });

    const result = await reschedulePost("post_1", new Date(Date.now() + 86400000).toISOString());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rescheduled).toBe(true);
  });
});

describe("listScheduledPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("returns empty array when no posts", async () => {
    mockDb.all.mockResolvedValueOnce([]);

    const result = await listScheduledPosts();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  it("returns posts enriched with asset and account", async () => {
    mockDb.all.mockResolvedValueOnce([
      {
        id: "post_1",
        workspaceId: "ws_1",
        contentAssetId: "asset_1",
        connectedAccountId: "acc_1",
        postStatus: "queued",
        platform: "instagram",
      },
    ]);
    // asset lookup then account lookup for the one post
    mockDb.get
      .mockResolvedValueOnce({ id: "asset_1", body: "Test caption", platform: "instagram" })
      .mockResolvedValueOnce({ id: "acc_1", platform: "instagram", platformUsername: "@test" });

    const result = await listScheduledPosts();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.contentAsset?.id).toBe("asset_1");
      expect(result.data[0]!.account?.id).toBe("acc_1");
    }
  });

  it("filters by status when provided", async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: "post_1", workspaceId: "ws_1", contentAssetId: "a1", connectedAccountId: "acc_1", postStatus: "queued" },
    ]);
    // The mock filters in the action by returning only "queued" from the DB query;
    // the action then filters client-side. Supply null for enrichment lookups.
    mockDb.get
      .mockResolvedValueOnce(null) // asset not found (OK for this test)
      .mockResolvedValueOnce(null); // account not found (OK for this test)

    const result = await listScheduledPosts("queued");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.postStatus).toBe("queued");
    }
  });
});
