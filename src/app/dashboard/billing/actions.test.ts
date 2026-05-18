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
  getBindings: vi.fn(() => ({
    DB: {},
    APP_URL: "https://app.test",
    STRIPE_SECRET_KEY: "sk_test_mock",
    KV: { put: vi.fn() },
  })),
}));

vi.mock("@/lib/db/client", () => ({
  createDb: vi.fn(() => mockDb),
}));

vi.mock("@/types/api", () => ({
  PLAN_LIMITS: {
    free: { contentPerMonth: 10, mediaPerMonth: 5, postsPerMonth: 20, seats: 1 },
    starter: { contentPerMonth: 100, mediaPerMonth: 50, postsPerMonth: 200, seats: 3 },
    pro: { contentPerMonth: 500, mediaPerMonth: 200, postsPerMonth: 1000, seats: 10 },
    enterprise: { contentPerMonth: Infinity, mediaPerMonth: Infinity, postsPerMonth: Infinity, seats: Infinity },
  },
}));

import { getBillingInfo, checkPlanLimit } from "./actions";

describe("getBillingInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if workspace not found", async () => {
    mockDb.get.mockResolvedValueOnce(null); // workspace not found

    const result = await getBillingInfo();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Workspace not found");
  });

  it("returns billing info with free plan defaults", async () => {
    // workspace
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "free", name: "Test" })
      // subscription
      .mockResolvedValueOnce(null);
    // usage records
    mockDb.all.mockResolvedValueOnce([]);

    const result = await getBillingInfo();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subscription).toBeNull();
      expect(result.data.usage.contentGenerated).toBe(0);
      expect(result.data.limits.contentPerMonth).toBe(10);
    }
  });

  it("sums usage records by metric", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "starter", name: "Test" })
      .mockResolvedValueOnce({ id: "sub_1", status: "active", currentPeriodStart: new Date() });

    mockDb.all.mockResolvedValueOnce([
      { metric: "content_generated", count: 5 },
      { metric: "content_generated", count: 3 },
      { metric: "posts_published", count: 10 },
      { metric: "api_calls", count: 100 },
    ]);

    const result = await getBillingInfo();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.usage.contentGenerated).toBe(8);
      expect(result.data.usage.postsPublished).toBe(10);
      expect(result.data.usage.apiCalls).toBe(100);
    }
  });

  it("uses correct plan limits for pro plan", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "pro", name: "Test" })
      .mockResolvedValueOnce(null);
    mockDb.all.mockResolvedValueOnce([]);

    const result = await getBillingInfo();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limits.contentPerMonth).toBe(500);
      expect(result.data.limits.seats).toBe(10);
    }
  });
});

describe("checkPlanLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed=true when under limit", async () => {
    // workspace
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "free" })
      // usage record
      .mockResolvedValueOnce({ count: 3 });

    const result = await checkPlanLimit("content_generated");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowed).toBe(true);
      expect(result.data.current).toBe(3);
      expect(result.data.limit).toBe(10);
    }
  });

  it("returns allowed=false when at limit", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "free" })
      .mockResolvedValueOnce({ count: 10 });

    const result = await checkPlanLimit("content_generated");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowed).toBe(false);
      expect(result.data.current).toBe(10);
    }
  });

  it("returns 0 usage when no record exists", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "free" })
      .mockResolvedValueOnce(null);

    const result = await checkPlanLimit("posts_published");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.current).toBe(0);
      expect(result.data.allowed).toBe(true);
    }
  });

  it("returns Infinity limit for media_generated metric", async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: "ws_1", plan: "free" })
      .mockResolvedValueOnce(null);

    const result = await checkPlanLimit("media_generated");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(Infinity);
      expect(result.data.allowed).toBe(true);
    }
  });
});
