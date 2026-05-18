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
  limit: vi.fn(() => mockDb),
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
  createId: vi.fn(() => "campaign_mock_id"),
}));

vi.mock("@/lib/ai/claude", () => ({
  generateWithClaude: vi.fn(),
}));

import {
  createCampaign,
  updateCampaignStatus,
  deleteCampaign,
  createVariant,
  markVariantWinner,
  generateAdCopy,
} from "./actions";
import { generateWithClaude } from "@/lib/ai/claude";

const mockGenerateWithClaude = vi.mocked(generateWithClaude);

describe("createCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({
      id: "campaign_mock_id",
      workspaceId: "ws_1",
      name: "Test Campaign",
      platform: "meta",
      objective: "conversions",
      campaignStatus: "draft",
    });
  });

  it("rejects missing name", async () => {
    const fd = new FormData();
    fd.set("name", "");
    fd.set("platform", "meta");
    fd.set("objective", "conversions");

    const result = await createCampaign(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid platform", async () => {
    const fd = new FormData();
    fd.set("name", "Test");
    fd.set("platform", "snapchat");
    fd.set("objective", "conversions");

    const result = await createCampaign(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid objective", async () => {
    const fd = new FormData();
    fd.set("name", "Test");
    fd.set("platform", "meta");
    fd.set("objective", "money");

    const result = await createCampaign(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("creates campaign with valid input", async () => {
    const fd = new FormData();
    fd.set("name", "Q3 Promo");
    fd.set("platform", "google");
    fd.set("objective", "traffic");

    const result = await createCampaign(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("campaign_mock_id");
    }
  });

  it("accepts all valid platforms", async () => {
    for (const platform of ["meta", "google", "x"]) {
      mockDb.get.mockResolvedValue({
        id: "campaign_mock_id",
        workspaceId: "ws_1",
        platform,
        name: "Test",
        objective: "awareness",
        campaignStatus: "draft",
      });

      const fd = new FormData();
      fd.set("name", `${platform} campaign`);
      fd.set("platform", platform);
      fd.set("objective", "awareness");

      const result = await createCampaign(fd);
      expect(result.success).toBe(true);
    }
  });
});

describe("updateCampaignStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects campaign not found in workspace", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await updateCampaignStatus("ghost_campaign", "active");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("updates status for owned campaign", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "campaign_1",
      workspaceId: "ws_1",
      campaignStatus: "draft",
    });

    const result = await updateCampaignStatus("campaign_1", "active");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.updated).toBe(true);
  });

  it("accepts all valid statuses", async () => {
    for (const status of ["draft", "active", "paused", "completed", "archived"] as const) {
      mockDb.get.mockResolvedValueOnce({
        id: "campaign_1",
        workspaceId: "ws_1",
      });

      const result = await updateCampaignStatus("campaign_1", status);
      expect(result.success).toBe(true);
    }
  });
});

describe("deleteCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects campaign not in workspace", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await deleteCampaign("ghost");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("deletes campaign in same workspace", async () => {
    mockDb.get.mockResolvedValueOnce({ id: "campaign_1", workspaceId: "ws_1" });

    const result = await deleteCampaign("campaign_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deleted).toBe(true);
  });
});

describe("createVariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({
      id: "variant_mock_id",
      campaignId: "campaign_1",
      headline: "Buy Now",
      body: "Great offer",
    });
  });

  it("rejects missing headline", async () => {
    const fd = new FormData();
    fd.set("campaignId", "campaign_1");
    fd.set("headline", "");
    fd.set("body", "Some body text");

    const result = await createVariant(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid landing URL", async () => {
    const fd = new FormData();
    fd.set("campaignId", "campaign_1");
    fd.set("headline", "Buy Now");
    fd.set("body", "Some body");
    fd.set("landingUrl", "not-a-url");

    const result = await createVariant(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("creates variant with valid input", async () => {
    const fd = new FormData();
    fd.set("campaignId", "campaign_1");
    fd.set("headline", "Get Started Today");
    fd.set("body", "Join thousands of happy customers.");
    fd.set("ctaText", "Sign Up");
    fd.set("landingUrl", "https://example.com");

    const result = await createVariant(fd);
    expect(result.success).toBe(true);
  });
});

describe("markVariantWinner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects campaign not owned by workspace", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await markVariantWinner("variant_1", "ghost_campaign");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("marks variant as winner", async () => {
    mockDb.get.mockResolvedValueOnce({ id: "campaign_1", workspaceId: "ws_1" });

    const result = await markVariantWinner("variant_1", "campaign_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.updated).toBe(true);
  });
});

describe("generateAdCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects campaign not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await generateAdCopy("ghost_campaign");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("returns 3 variants from AI response", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "campaign_1",
      workspaceId: "ws_1",
      name: "Summer Sale",
      platform: "meta",
      objective: "conversions",
    });

    const mockVariants = [
      { headline: "Save Big", body: "Up to 50% off.", ctaText: "Shop Now" },
      { headline: "Limited Time", body: "Don't miss out.", ctaText: "Buy Today" },
      { headline: "Best Deals", body: "Top products.", ctaText: "Get Yours" },
    ];
    mockGenerateWithClaude.mockResolvedValueOnce(JSON.stringify(mockVariants));

    const result = await generateAdCopy("campaign_1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0]!.headline).toBe("Save Big");
    }
  });

  it("handles AI not returning valid JSON array", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "campaign_1",
      workspaceId: "ws_1",
      name: "Test",
      platform: "google",
      objective: "traffic",
    });

    mockGenerateWithClaude.mockResolvedValueOnce("Not valid JSON at all");

    const result = await generateAdCopy("campaign_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("JSON");
  });
});
