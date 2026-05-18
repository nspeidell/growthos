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
  createId: vi.fn(() => "brand_mock_id"),
}));

import {
  getBrandProfile,
  upsertBrandProfile,
  getBrandColors,
  addBrandColor,
  deleteBrandColor,
} from "./actions";

describe("getBrandProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no profile exists", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await getBrandProfile();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeNull();
  });

  it("returns brand profile when it exists", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "brand_1",
      workspaceId: "ws_1",
      brandName: "Reunion",
      mission: "Bring families together",
      tone: "Warm and inspiring",
      audience: '["parents", "families"]',
    });

    const result = await getBrandProfile();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.brandName).toBe("Reunion");
    }
  });
});

describe("upsertBrandProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing brandName", async () => {
    const fd = new FormData();
    fd.set("brandName", "");
    fd.set("mission", "Our mission");
    fd.set("tone", "Professional");
    fd.set("audience", '["everyone"]');

    const result = await upsertBrandProfile(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects missing mission", async () => {
    const fd = new FormData();
    fd.set("brandName", "My Brand");
    fd.set("mission", "");
    fd.set("tone", "Professional");
    fd.set("audience", '["everyone"]');

    const result = await upsertBrandProfile(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("creates new profile when none exists", async () => {
    mockDb.get.mockResolvedValueOnce(null); // no existing profile

    const fd = new FormData();
    fd.set("brandName", "My Brand");
    fd.set("mission", "To help people grow");
    fd.set("tone", "Conversational and direct");
    fd.set("audience", '["entrepreneurs", "marketers"]');

    const result = await upsertBrandProfile(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandName).toBe("My Brand");
    }
  });

  it("updates existing profile", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "brand_1",
      workspaceId: "ws_1",
      brandName: "Old Name",
      mission: "Old mission",
      tone: "Old tone",
      audience: '["old"]',
    });

    const fd = new FormData();
    fd.set("brandName", "New Name");
    fd.set("mission", "New mission statement");
    fd.set("tone", "Bold and direct");
    fd.set("audience", '["new audience"]');

    const result = await upsertBrandProfile(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandName).toBe("New Name");
    }
  });
});

describe("getBrandColors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no brand profile", async () => {
    mockDb.get.mockResolvedValueOnce(null); // no profile

    const result = await getBrandColors();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  it("returns colors for existing profile", async () => {
    mockDb.get.mockResolvedValueOnce({ id: "brand_1", workspaceId: "ws_1" });
    mockDb.all.mockResolvedValueOnce([
      { id: "color_1", brandId: "brand_1", label: "Primary", hex: "#3B82F6" },
      { id: "color_2", brandId: "brand_1", label: "Accent", hex: "#10B981" },
    ]);

    const result = await getBrandColors();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.hex).toBe("#3B82F6");
    }
  });
});

describe("addBrandColor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing label", async () => {
    const fd = new FormData();
    fd.set("label", "");
    fd.set("hex", "#FF0000");

    const result = await addBrandColor(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid hex color", async () => {
    const fd = new FormData();
    fd.set("label", "Primary");
    fd.set("hex", "red"); // not a valid hex

    const result = await addBrandColor(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects hex without #", async () => {
    const fd = new FormData();
    fd.set("label", "Primary");
    fd.set("hex", "FF0000");

    const result = await addBrandColor(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects when no brand profile exists", async () => {
    mockDb.get.mockResolvedValueOnce(null); // no profile

    const fd = new FormData();
    fd.set("label", "Primary");
    fd.set("hex", "#3B82F6");

    const result = await addBrandColor(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("brand profile");
  });

  it("adds color to existing brand profile", async () => {
    mockDb.get.mockResolvedValueOnce({ id: "brand_1", workspaceId: "ws_1" });

    const fd = new FormData();
    fd.set("label", "Primary Blue");
    fd.set("hex", "#3B82F6");
    fd.set("usage", "Main CTAs and buttons");

    const result = await addBrandColor(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe("Primary Blue");
      expect(result.data.hex).toBe("#3B82F6");
    }
  });

  it("accepts valid hex formats", async () => {
    for (const hex of ["#000000", "#FFFFFF", "#3b82f6", "#A1B2C3"]) {
      mockDb.get.mockResolvedValueOnce({ id: "brand_1", workspaceId: "ws_1" });

      const fd = new FormData();
      fd.set("label", "Test");
      fd.set("hex", hex);

      const result = await addBrandColor(fd);
      expect(result.success).toBe(true);
    }
  });
});

describe("deleteBrandColor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes color by id", async () => {
    const result = await deleteBrandColor("color_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deleted).toBe(true);
  });
});
