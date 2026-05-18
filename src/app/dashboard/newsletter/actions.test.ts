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
  getBindings: vi.fn(() => ({
    DB: {},
    KV: { put: vi.fn() },
    RESEND_API_KEY: "re_test_key",
  })),
}));

vi.mock("@/lib/db/client", () => ({
  createDb: vi.fn(() => mockDb),
}));

vi.mock("@paralleldrive/cuid2", () => ({
  createId: vi.fn(() => "nl_mock_id"),
}));

vi.mock("@/lib/email/resend-client", () => ({
  ResendClient: vi.fn().mockImplementation(() => ({
    sendBatch: vi.fn(() => Promise.resolve()),
  })),
  generateNewsletterHtml: vi.fn(() => "<html>Mock HTML</html>"),
}));

vi.mock("@/lib/ai/claude", () => ({
  generateWithClaude: vi.fn(),
}));

import {
  addSubscriber,
  createNewsletter,
  sendNewsletter,
  deleteNewsletter,
  generateNewsletterWithAI,
} from "./actions";
import { generateWithClaude } from "@/lib/ai/claude";

const mockGenerateWithClaude = vi.mocked(generateWithClaude);

describe("addSubscriber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects invalid email", async () => {
    const fd = new FormData();
    fd.set("email", "not-an-email");

    const result = await addSubscriber(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects duplicate subscriber", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "existing_sub",
      workspaceId: "ws_1",
      email: "already@test.com",
    });

    const fd = new FormData();
    fd.set("email", "already@test.com");

    const result = await addSubscriber(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("already exists");
  });

  it("adds valid new subscriber", async () => {
    // no duplicate
    mockDb.get.mockResolvedValueOnce(null);
    // newly created subscriber returned
    mockDb.get.mockResolvedValueOnce({
      id: "nl_mock_id",
      workspaceId: "ws_1",
      email: "new@test.com",
      subscriberStatus: "active",
    });

    const fd = new FormData();
    fd.set("email", "new@test.com");
    fd.set("name", "John Doe");
    fd.set("source", "newsletter");

    const result = await addSubscriber(fd);
    expect(result.success).toBe(true);
  });

  it("rejects invalid source value", async () => {
    const fd = new FormData();
    fd.set("email", "test@test.com");
    fd.set("source", "invalid_source");

    const result = await addSubscriber(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });
});

describe("createNewsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
    mockDb.get.mockResolvedValue({
      id: "nl_mock_id",
      workspaceId: "ws_1",
      subject: "Hello World",
      newsletterStatus: "draft",
    });
  });

  it("rejects missing subject", async () => {
    const fd = new FormData();
    fd.set("subject", "");
    fd.set("body", "Some content");

    const result = await createNewsletter(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects missing body", async () => {
    const fd = new FormData();
    fd.set("subject", "Test Subject");
    fd.set("body", "");

    const result = await createNewsletter(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid fromEmail", async () => {
    const fd = new FormData();
    fd.set("subject", "Hello");
    fd.set("body", "Content");
    fd.set("fromEmail", "not-an-email");

    const result = await createNewsletter(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("creates newsletter with valid input", async () => {
    const fd = new FormData();
    fd.set("subject", "Monthly Update");
    fd.set("body", "Here is what's new this month...");
    fd.set("fromName", "The Team");
    fd.set("fromEmail", "team@company.com");

    const result = await createNewsletter(fd);
    expect(result.success).toBe(true);
  });
});

describe("sendNewsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects newsletter not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await sendNewsletter("ghost_nl");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("rejects newsletter in wrong workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "nl_1",
      workspaceId: "ws_other",
      newsletterStatus: "draft",
    });

    const result = await sendNewsletter("nl_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("rejects already sent newsletter", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "nl_1",
      workspaceId: "ws_1",
      newsletterStatus: "sent",
    });

    const result = await sendNewsletter("nl_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("draft");
  });

  it("rejects when no active subscribers", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "nl_1",
      workspaceId: "ws_1",
      newsletterStatus: "draft",
      targetTags: null,
      subject: "Test",
      htmlContent: "<html>test</html>",
      textContent: "test",
    });
    mockDb.all.mockResolvedValueOnce([]); // no subscribers

    const result = await sendNewsletter("nl_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("No subscribers");
  });

  it("sends to all active subscribers and returns count", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "nl_1",
      workspaceId: "ws_1",
      newsletterStatus: "draft",
      targetTags: null,
      subject: "Test Newsletter",
      htmlContent: "<html>test</html>",
      textContent: "Test content",
      fromName: "Team",
      fromEmail: "team@co.com",
    });
    // active subscribers
    mockDb.all.mockResolvedValueOnce([
      { id: "sub_1", email: "a@test.com", subscriberStatus: "active" },
      { id: "sub_2", email: "b@test.com", subscriberStatus: "active" },
    ]);

    const result = await sendNewsletter("nl_1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sent).toBe(true);
      expect(result.data.count).toBe(2);
    }
  });
});

describe("deleteNewsletter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("rejects newsletter not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await deleteNewsletter("ghost");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("rejects newsletter from different workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "nl_1",
      workspaceId: "ws_other",
    });

    const result = await deleteNewsletter("nl_1");
    expect(result.success).toBe(false);
  });

  it("deletes newsletter in same workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "nl_1",
      workspaceId: "ws_1",
    });

    const result = await deleteNewsletter("nl_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deleted).toBe(true);
  });
});

describe("generateNewsletterWithAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockReset();
    mockDb.all.mockReset();
  });

  it("returns parsed newsletter fields from AI", async () => {
    const mockResponse = JSON.stringify({
      subject: "AI Growth Tips",
      previewText: "Your weekly growth update",
      body: "<p>Here is your update...</p>",
    });
    mockGenerateWithClaude.mockResolvedValueOnce(mockResponse);

    const result = await generateNewsletterWithAI("growth marketing");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("AI Growth Tips");
      expect(result.data.previewText).toBe("Your weekly growth update");
    }
  });

  it("fails if AI returns no JSON", async () => {
    mockGenerateWithClaude.mockResolvedValueOnce("Just some plain text with no JSON");

    const result = await generateNewsletterWithAI("topic");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("JSON");
  });

  it("fails if AI JSON is missing required fields", async () => {
    mockGenerateWithClaude.mockResolvedValueOnce(JSON.stringify({ subject: "Only subject" }));

    const result = await generateNewsletterWithAI("topic");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("missing");
  });
});
