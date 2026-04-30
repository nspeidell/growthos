import { describe, it, expect } from "vitest";
import { hasPermission, getPermissions, PermissionError } from "./middleware";
import type { Permission } from "./middleware";

describe("hasPermission", () => {
  it("owner has all permissions", () => {
    const allPerms: Permission[] = [
      "content:read",
      "content:write",
      "publish:write",
      "publish:queue",
      "publish:approve",
      "analytics:read",
      "analytics:write",
      "team:read",
      "team:write",
      "billing:read",
      "billing:write",
      "settings:write",
      "swarm:read",
      "swarm:launch",
      "swarm:admin",
    ];
    for (const perm of allPerms) {
      expect(hasPermission("owner", perm)).toBe(true);
    }
  });

  it("viewer can only read content, analytics, and swarm", () => {
    expect(hasPermission("viewer", "content:read")).toBe(true);
    expect(hasPermission("viewer", "analytics:read")).toBe(true);
    expect(hasPermission("viewer", "content:write")).toBe(false);
    expect(hasPermission("viewer", "team:write")).toBe(false);
    expect(hasPermission("viewer", "billing:read")).toBe(false);
  });

  it("marketer can write content and publish but not manage team or billing", () => {
    expect(hasPermission("marketer", "content:write")).toBe(true);
    expect(hasPermission("marketer", "publish:write")).toBe(true);
    expect(hasPermission("marketer", "publish:approve")).toBe(true);
    expect(hasPermission("marketer", "team:write")).toBe(false);
    expect(hasPermission("marketer", "billing:write")).toBe(false);
    expect(hasPermission("marketer", "settings:write")).toBe(false);
  });

  it("admin has team:write but not billing:write", () => {
    expect(hasPermission("admin", "team:write")).toBe(true);
    expect(hasPermission("admin", "billing:write")).toBe(false);
    expect(hasPermission("admin", "settings:write")).toBe(true);
  });

  it("analyst can read and write analytics but not content:write", () => {
    expect(hasPermission("analyst", "analytics:read")).toBe(true);
    expect(hasPermission("analyst", "analytics:write")).toBe(true);
    expect(hasPermission("analyst", "content:write")).toBe(false);
    expect(hasPermission("analyst", "publish:write")).toBe(false);
  });

  it("content_manager can queue but not approve", () => {
    expect(hasPermission("content_manager", "content:write")).toBe(true);
    expect(hasPermission("content_manager", "publish:queue")).toBe(true);
    expect(hasPermission("content_manager", "publish:approve")).toBe(false);
    expect(hasPermission("content_manager", "publish:write")).toBe(false);
  });

  it("unknown role has no permissions", () => {
    expect(hasPermission("nonexistent_role", "content:read")).toBe(false);
    expect(hasPermission("", "content:read")).toBe(false);
  });
});

describe("getPermissions", () => {
  it("returns all owner permissions", () => {
    const perms = getPermissions("owner");
    expect(perms).toHaveLength(15);
    expect(perms).toContain("billing:write");
    expect(perms).toContain("settings:write");
  });

  it("returns empty array for unknown role", () => {
    expect(getPermissions("ghost")).toEqual([]);
  });

  it("viewer has exactly 3 permissions", () => {
    const perms = getPermissions("viewer");
    expect(perms).toHaveLength(3);
    expect(perms).toContain("content:read");
    expect(perms).toContain("analytics:read");
    expect(perms).toContain("swarm:read");
  });
});

describe("PermissionError", () => {
  it("has correct name and message", () => {
    const err = new PermissionError("test message");
    expect(err.name).toBe("PermissionError");
    expect(err.message).toBe("test message");
    expect(err).toBeInstanceOf(Error);
  });

  it("uses default message when none provided", () => {
    const err = new PermissionError();
    expect(err.message).toBe("Insufficient permissions");
  });
});
