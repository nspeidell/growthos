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
  createId: vi.fn(() => "voice_mock_id"),
}));

import {
  listVoiceProfilesFull,
  createVoiceProfile,
  setFounderVoice,
  deleteVoiceProfile,
} from "./actions";

describe("listVoiceProfilesFull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no profiles", async () => {
    mockDb.all.mockResolvedValueOnce([]);

    const result = await listVoiceProfilesFull();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  it("returns all profiles for workspace", async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: "voice_1", workspaceId: "ws_1", name: "Nick Voice", isFounderVoice: true },
      { id: "voice_2", workspaceId: "ws_1", name: "Marketing Voice", isFounderVoice: false },
    ]);

    const result = await listVoiceProfilesFull();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(2);
  });
});

describe("createVoiceProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({
      id: "voice_mock_id",
      workspaceId: "ws_1",
      name: "Test Voice",
      elevenLabsVoiceId: "elabs_123",
      stability: 0.5,
      similarityBoost: 0.75,
      isFounderVoice: false,
    });
  });

  it("rejects missing name", async () => {
    const fd = new FormData();
    fd.set("name", "");
    fd.set("elevenLabsVoiceId", "elabs_123");

    const result = await createVoiceProfile(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects missing ElevenLabs voice ID", async () => {
    const fd = new FormData();
    fd.set("name", "Nick Voice");
    fd.set("elevenLabsVoiceId", "");

    const result = await createVoiceProfile(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects invalid voice sample URL", async () => {
    const fd = new FormData();
    fd.set("name", "Nick Voice");
    fd.set("elevenLabsVoiceId", "elabs_123");
    fd.set("voiceSampleUrl", "not-a-url");

    const result = await createVoiceProfile(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("rejects stability out of range", async () => {
    const fd = new FormData();
    fd.set("name", "Test");
    fd.set("elevenLabsVoiceId", "elabs_123");
    fd.set("stability", "1.5");

    const result = await createVoiceProfile(fd);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("VALIDATION");
  });

  it("creates voice profile with valid input", async () => {
    const fd = new FormData();
    fd.set("name", "Nick Voice");
    fd.set("elevenLabsVoiceId", "elabs_abc123");
    fd.set("stability", "0.6");
    fd.set("similarityBoost", "0.8");
    fd.set("isFounderVoice", "false");

    const result = await createVoiceProfile(fd);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Test Voice"); // from mock
    }
  });

  it("clears existing founder voice when setting new one", async () => {
    const fd = new FormData();
    fd.set("name", "New Founder Voice");
    fd.set("elevenLabsVoiceId", "elabs_xyz");
    fd.set("isFounderVoice", "true");

    await createVoiceProfile(fd);

    // Should have called update to clear existing founder flag
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith({ isFounderVoice: false });
  });
});

describe("setFounderVoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears all existing founder voices and sets new one", async () => {
    const result = await setFounderVoice("voice_2");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.success).toBe(true);
    // Should clear existing then set new
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });
});

describe("deleteVoiceProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects profile not found", async () => {
    mockDb.get.mockResolvedValueOnce(null);

    const result = await deleteVoiceProfile("ghost_voice");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("rejects profile from different workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "voice_1",
      workspaceId: "ws_other",
    });

    const result = await deleteVoiceProfile("voice_1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("not found");
  });

  it("deletes profile in same workspace", async () => {
    mockDb.get.mockResolvedValueOnce({
      id: "voice_1",
      workspaceId: "ws_1",
    });

    const result = await deleteVoiceProfile("voice_1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deleted).toBe(true);
  });
});
