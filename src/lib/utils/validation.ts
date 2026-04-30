import { z } from "zod";

// ═══════════════════════════════════════════
// Shared Validation Schemas
// ═══════════════════════════════════════════

/**
 * Workspace creation/update
 */
export const WorkspaceSchema = z.object({
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be under 100 characters"),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers, and hyphens only"
    ),
});

/**
 * Team member invitation
 */
export const InviteMemberSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: z.enum([
    "admin",
    "marketer",
    "analyst",
    "content_manager",
    "viewer",
  ]),
});

/**
 * Role update
 */
export const UpdateRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum([
    "admin",
    "marketer",
    "analyst",
    "content_manager",
    "viewer",
  ]),
});

/**
 * Pagination params
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * ID parameter
 */
export const IdSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

// ═══════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════

export type WorkspaceInput = z.infer<typeof WorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
