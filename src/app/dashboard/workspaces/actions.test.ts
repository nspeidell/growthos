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
  all: vi.fn(() => []),
  get: vi.fn(() => null),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => mockDb),
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
  delete: vi.fn(() => mockDb),
};

vi.mock("@/lib/auth/middleware", () => ({
  requireAuth: vi.fn(() => Promise.resolve(mockSession)),
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
  createId: vi.fn(() => "ws_mock_id"),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(() => Promise.resolve("new_session_id")),
  SESSION_COOKIE_NAME: "growthos_session",
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      set: vi.fn(),
      get: vi.fn(),
    })
  ),
}));

import {
  listWorkspaces,
  createWorkspace,
  switchWorkspace,
  deleteWorkspace,
} from "./actions";

describe("listWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when user has no memberships", async () => {
    mockDb.all.mockResolvedValueOnce([]);

    const result = await listWorkspaces();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  it("returns workspaces with roles", async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: "member_1", workspaceId: "ws_1", userId: "user_1", role: "owner" },
      { id: "member_2", workspaceId: "ws_2", userId: "user_1", role: "admin" },
    ]);
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", name: "My Brand", slug: "my-brand" })
      .mockResolvedValueOnce({ id: "ws_2", name: "Side Project", slug: "side-project" });

    const result = await listWorkspaces();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.role).toBe("owner");
      expect(result.data[1]!.role).toBe("admin");
    }
  });

  it("skips memberships where workspace is missing", async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: "member_1", workspaceId: "ws_deleted", userId: "user_1", role: "viewer" },
    ]);
    mockDb.get.mockResolvedValueOnce(null); // workspace no longer exists

    const result = await listWorkspaces();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(0);
  });
});

describe("createWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({
      id: "ws_mock_id",
      name: "New Workspace",
      slug: "new-ws",
      plan: "free",
    });
  });

  it("rejects missing name", async () => {
    const fd = new FormData();
    fd.set("name", "");
    fd.set("slug", "my-workspace");

    const result = await createWorkspace(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid slug format (uppercase)", async () => {
    const fd = new FormData();
    fd.set("name", "My Workspace");
    fd.set("slug", "MY-WORKSPACE");

    const result = await createWorkspace(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects slug with spaces", async () => {
    const fd = new FormData();
    fd.set("name", "My Workspace");
    fd.set("slug", "my workspace");

    const result = await createWorkspace(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects slug with special characters", async () => {
    const fd = new FormData();
    fd.set("name", "My Workspace");
    fd.set("slug", "my_workspace!");

    const result = await createWorkspace(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects duplicate slug", async () => {
    // First .get() call is the slug uniqueness check
    mockDb.get.mockReset();
    mockDb.get.mockResolvedValueOnce({ id: "existing_ws", slug: "taken-slug" });

    const fd = new FormData();
    fd.set("name", "My Brand");
    fd.set("slug", "taken-slug");

    const result = await createWorkspace(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already exists");
  });

  it("creates workspace with valid slug", async () => {
    mockDb.get.mockReset();
    mockDb.get
      .mockResolvedValueOnce(null) // slug uniqueness check — no conflict
      .mockResolvedValueOnce({ id: "ws_mock_id", name: "Growth Brand", slug: "growth-brand", plan: "free" });

    const fd = new FormData();
    fd.set("name", "Growth Brand");
    fd.set("slug", "growth-brand");

    const result = await createWorkspace(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("growth-brand");
    }
  });

  it("accepts valid slug formats", async () => {
    for (const slug of ["my-brand", "reunion123", "a1b2c3"]) {
      mockDb.get.mockReset();
      mockDb.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "ws_mock_id", name: "Test", slug, plan: "free" });

      const fd = new FormData();
      fd.set("name", "Test");
      fd.set("slug", slug);

      const result = await createWorkspace(fd);
      expect(result.success).toBe(true);
    }
  });
});

describe("switchWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects if user is not a member of target workspace", async () => {
    mockDb.all.mockResolvedValueOnce([
      { workspaceId: "ws_2", userId: "user_other", role: "admin" },
    ]);

    const result = await switchWorkspace("ws_2");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not a member");
  });

  it("rejects if workspace not found", async () => {
    mockDb.all.mockResolvedValueOnce([
      { workspaceId: "ws_2", userId: "user_1", role: "viewer" },
    ]);
    mockDb.get.mockResolvedValueOnce(null); // workspace not found

    const result = await switchWorkspace("ws_2");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("switches workspace for valid member", async () => {
    mockDb.all.mockResolvedValueOnce([
      { workspaceId: "ws_2", userId: "user_1", role: "admin" },
    ]);
    mockDb.get.mockResolvedValueOnce({
      id: "ws_2",
      name: "Second Brand",
      slug: "second-brand",
    });

    const result = await switchWorkspace("ws_2");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.switched).toBe(true);
  });
});

describe("deleteWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects if user is not a member", async () => {
    mockDb.all.mockResolvedValueOnce([
      { workspaceId: "ws_1", userId: "user_other", role: "owner" },
    ]);

    const result = await deleteWorkspace("ws_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("owner");
  });

  it("rejects if user is not the owner", async () => {
    mockDb.all.mockResolvedValueOnce([
      { workspaceId: "ws_1", userId: "user_1", role: "admin" },
    ]);

    const result = await deleteWorkspace("ws_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("owner");
  });

  it("deletes workspace when user is owner", async () => {
    mockDb.all.mockResolvedValueOnce([
      { workspaceId: "ws_1", userId: "user_1", role: "owner" },
    ]);

    const result = await deleteWorkspace("ws_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deleted).toBe(true);
  });
});
