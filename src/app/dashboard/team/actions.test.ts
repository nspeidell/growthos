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
  innerJoin: vi.fn(() => mockDb),
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
  createId: vi.fn(() => "mock_id_123"),
}));

import { inviteMember, updateMemberRole, removeMember } from "./actions";
import { requirePermission } from "@/lib/auth/middleware";

describe("inviteMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue(null);
    mockDb.all.mockResolvedValue([]);
  });

  it("rejects invalid email", async () => {
    const fd = new FormData();
    fd.set("email", "not-an-email");
    fd.set("role", "viewer");

    const result = await inviteMember(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("VALIDATION");
    }
  });

  it("rejects owner role assignment", async () => {
    const fd = new FormData();
    fd.set("email", "new@test.com");
    fd.set("role", "owner");

    const result = await inviteMember(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("owner");
    }
  });

  it("rejects invalid role value", async () => {
    const fd = new FormData();
    fd.set("email", "new@test.com");
    fd.set("role", "superadmin");

    const result = await inviteMember(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("VALIDATION");
    }
  });

  it("rejects if user is already a member", async () => {
    // User exists
    mockDb.get
      .mockResolvedValueOnce({ id: "user_2", email: "existing@test.com", name: "Existing" })
      // Already a member
      .mockResolvedValueOnce({ id: "member_1", workspaceId: "ws_1", userId: "user_2" });

    const fd = new FormData();
    fd.set("email", "existing@test.com");
    fd.set("role", "marketer");

    const result = await inviteMember(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("already a member");
    }
  });

  it("succeeds with valid input and new user", async () => {
    // User doesn't exist, then created user returned
    mockDb.get
      .mockResolvedValueOnce(null) // user lookup
      .mockResolvedValueOnce({ id: "mock_id_123", email: "new@test.com", name: "new" }) // after insert
      .mockResolvedValueOnce(null); // member check (not already member)

    const fd = new FormData();
    fd.set("email", "new@test.com");
    fd.set("role", "viewer");

    const result = await inviteMember(fd);
    expect(result.success).toBe(true);
  });
});

describe("updateMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects assigning owner role", async () => {
    const fd = new FormData();
    fd.set("memberId", "member_1");
    fd.set("role", "owner");

    const result = await updateMemberRole(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("owner");
    }
  });

  it("rejects changing the owner's role", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "member_1",
      workspaceId: "ws_1",
      role: "owner",
    });

    const fd = new FormData();
    fd.set("memberId", "member_1");
    fd.set("role", "admin");

    const result = await updateMemberRole(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("owner");
    }
  });

  it("rejects if member not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const fd = new FormData();
    fd.set("memberId", "nonexistent");
    fd.set("role", "admin");

    const result = await updateMemberRole(fd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("rejects if member belongs to different workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "member_1",
      workspaceId: "ws_other",
      role: "viewer",
    });

    const fd = new FormData();
    fd.set("memberId", "member_1");
    fd.set("role", "admin");

    const result = await updateMemberRole(fd);
    expect(result.success).toBe(false);
  });
});

describe("removeMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects removing workspace owner", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "member_owner",
      workspaceId: "ws_1",
      userId: "user_other",
      role: "owner",
    });

    const result = await removeMember("member_owner");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("owner");
    }
  });

  it("rejects self-removal", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "member_self",
      workspaceId: "ws_1",
      userId: "user_1", // same as session userId
      role: "admin",
    });

    const result = await removeMember("member_self");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("yourself");
    }
  });

  it("rejects if member not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await removeMember("ghost_member");
    expect(result.success).toBe(false);
  });

  it("succeeds for valid non-owner, non-self member", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "member_2",
      workspaceId: "ws_1",
      userId: "user_other",
      role: "viewer",
    });

    const result = await removeMember("member_2");
    expect(result.success).toBe(true);
  });
});
