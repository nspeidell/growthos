import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ═══════════════════════════════════════════
// Phase 1: Foundation Tables
// ═══════════════════════════════════════════

// ─── USERS ───
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  googleId: text("google_id").unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── WORKSPACES ───
export const workspaces = sqliteTable("workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  stripeCustomerId: text("stripe_customer_id"),
  plan: text("plan", { enum: ["free", "pro", "enterprise"] })
    .notNull()
    .default("free"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── WORKSPACE MEMBERS ───
export const workspaceMembers = sqliteTable("workspace_members", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: [
      "owner",
      "admin",
      "marketer",
      "analyst",
      "content_manager",
      "viewer",
    ],
  })
    .notNull()
    .default("viewer"),
  joinedAt: integer("joined_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SESSIONS ───
// Primary session storage is KV (see lib/auth/session.ts)
// This table exists for audit/backup purposes
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── AUDIT LOGS ───
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  metadata: text("metadata"), // JSON
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ═══════════════════════════════════════════
// Phase 2: Content + Media Tables
// ═══════════════════════════════════════════

// ─── BRAND PROFILES ───
export const brandProfiles = sqliteTable("brand_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  brandName: text("brand_name").notNull(),
  tagline: text("tagline"),
  mission: text("mission").notNull(),
  vision: text("vision"),
  tone: text("tone").notNull(),
  audience: text("audience").notNull(), // JSON: audience segments
  keywords: text("keywords"), // JSON: brand keywords
  guidelines: text("guidelines"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── BRAND COLORS ───
export const brandColors = sqliteTable("brand_colors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  brandId: text("brand_id")
    .notNull()
    .references(() => brandProfiles.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  hex: text("hex").notNull(),
  usage: text("usage"),
});

// ─── BRAND ASSETS ───
export const brandAssets = sqliteTable("brand_assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  brandId: text("brand_id")
    .notNull()
    .references(() => brandProfiles.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["logo", "icon", "font", "template", "photo"],
  }).notNull(),
  name: text("name").notNull(),
  r2Key: text("r2_key").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── DOCTRINE PROFILES ───
export const doctrineProfiles = sqliteTable("doctrine_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  modeKey: text("mode_key", {
    enum: [
      "garyvee",
      "mrbeast",
      "hormozi",
      "brunson",
      "sethgodin",
      "dankennedy",
      "balanced",
    ],
  })
    .notNull()
    .unique(),
  displayName: text("display_name").notNull(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  rules: text("rules").notNull(), // JSON: content rules
  platforms: text("platforms"), // JSON: platform-specific overrides
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
});

// ─── CONTENT PROJECTS ───
export const contentProjects = sqliteTable("content_projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  brief: text("brief"),
  doctrineMode: text("doctrine_mode").notNull(),
  status: text("status", {
    enum: ["draft", "generating", "review", "approved", "published", "archived"],
  })
    .notNull()
    .default("draft"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── CONTENT ASSETS ───
export const contentAssets = sqliteTable("content_assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  projectId: text("project_id")
    .notNull()
    .references(() => contentProjects.id, { onDelete: "cascade" }),
  platform: text("platform", {
    enum: [
      "instagram", "facebook", "reddit", "youtube", "x", "website", "email",
      "linkedin", "pinterest", "tiktok", "threads", "google_business",
      "wordpress", "medium", "ghost", "substack",
    ],
  }).notNull(),
  type: text("type", {
    enum: [
      "caption", "thread", "post", "script", "blog", "carousel",
      "hook", "meme_copy", "quote_card", "landing_copy", "email",
      "newsletter", "pin", "story", "reel_script",
    ],
  }).notNull(),
  body: text("body").notNull(),
  metadata: text("metadata"), // JSON: hashtags, keywords, scores
  score: text("score"), // JSON: AI quality scores
  r2Key: text("r2_key"),
  version: integer("version").notNull().default(1),
  status: text("asset_status", {
    enum: ["draft", "review", "approved", "rejected"],
  })
    .notNull()
    .default("draft"),
  // Video realism: subject tagging for B-roll matching
  subjectTags: text("subject_tags"), // JSON array: e.g. ["elders", "kids", "family"]
  emotionalVibe: text("emotional_vibe"), // e.g. "joyful", "nostalgic", "energetic"
  isUgc: integer("is_ugc", { mode: "boolean" }).default(false),
  mediaJobId: text("media_job_id"), // FK to media_jobs for auto-queued media
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── VOICE PROFILES ───
export const voiceProfiles = sqliteTable("voice_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  elevenLabsVoiceId: text("eleven_labs_voice_id").notNull(),
  voiceSampleUrl: text("voice_sample_url"),
  stability: real("stability").default(0.5),
  similarityBoost: real("similarity_boost").default(0.75),
  isFounderVoice: integer("is_founder_voice", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── MEDIA JOBS ───
export const mediaJobs = sqliteTable("media_jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "meme",
      "quote_card",
      "thumbnail",
      "promo",
      "carousel_slide",
      "ad_creative",
      "video_composite",
    ],
  }).notNull(),
  prompt: text("prompt").notNull(),
  provider: text("provider", {
    enum: ["replicate", "together", "cloudflare", "elevenlabs"],
  }).notNull(),
  voiceProfileId: text("voice_profile_id").references(() => voiceProfiles.id),
  config: text("config"), // JSON: dimensions, style, template
  status: text("job_status", {
    enum: ["queued", "processing", "completed", "failed"],
  })
    .notNull()
    .default("queued"),
  resultR2Key: text("result_r2_key"),
  errorMessage: text("error_message"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ═══════════════════════════════════════════
// Phase 3: Publisher Tables
// ═══════════════════════════════════════════

// ─── CONNECTED ACCOUNTS ───
export const connectedAccounts = sqliteTable("connected_accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform", {
    enum: ["instagram", "facebook", "youtube", "x", "reddit", "pinterest", "linkedin", "tiktok", "google_business", "threads", "wordpress", "medium", "ghost", "substack"],
  }).notNull(),
  platformAccountId: text("platform_account_id").notNull(),
  platformUsername: text("platform_username"),
  platformAvatarUrl: text("platform_avatar_url"),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp" }),
  scopes: text("scopes"), // JSON: granted scopes
  accountStatus: text("account_status", {
    enum: ["active", "expired", "revoked", "error"],
  })
    .notNull()
    .default("active"),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  connectedAt: integer("connected_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SCHEDULED POSTS ───
export const scheduledPosts = sqliteTable("scheduled_posts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  contentAssetId: text("content_asset_id")
    .notNull()
    .references(() => contentAssets.id, { onDelete: "cascade" }),
  connectedAccountId: text("connected_account_id")
    .notNull()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  platform: text("platform", {
    enum: ["instagram", "facebook", "youtube", "x", "reddit", "pinterest", "linkedin", "tiktok", "google_business", "threads", "wordpress", "medium", "ghost", "substack"],
  }).notNull(),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }).notNull(),
  postStatus: text("post_status", {
    enum: [
      "draft",
      "queued",
      "approved",
      "publishing",
      "published",
      "failed",
      "cancelled",
    ],
  })
    .notNull()
    .default("draft"),
  approvalMode: text("approval_mode", {
    enum: ["manual", "autonomous"],
  })
    .notNull()
    .default("manual"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  platformPostId: text("platform_post_id"),
  platformPostUrl: text("platform_post_url"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  metadata: text("metadata"), // JSON: platform-specific options
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ═══════════════════════════════════════════
// Phase 4: SEO + Competitor Tables
// ═══════════════════════════════════════════

// ─── KEYWORDS ───
export const keywords = sqliteTable("keywords", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  phrase: text("phrase").notNull(),
  volume: integer("volume"),
  difficulty: integer("difficulty"),
  intent: text("intent", {
    enum: ["informational", "navigational", "transactional", "commercial"],
  }),
  cluster: text("cluster"),
  priority: text("priority", {
    enum: ["high", "medium", "low"],
  })
    .notNull()
    .default("medium"),
  status: text("status", {
    enum: ["research", "targeting", "ranking", "archived"],
  })
    .notNull()
    .default("research"),
  currentRank: integer("current_rank"),
  targetUrl: text("target_url"),
  lastChecked: integer("last_checked", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── PAGES ───
export const pages = sqliteTable("pages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  metaTitle: text("meta_title"),
  metaDesc: text("meta_desc"),
  h1: text("h1"),
  body: text("body"),
  schemaType: text("schema_type", {
    enum: ["Article", "FAQPage", "HowTo", "Product", "Organization"],
  }),
  schemaJson: text("schema_json"), // JSON-LD structured data
  ogImage: text("og_image"), // R2 key
  canonicalUrl: text("canonical_url"),
  pageStatus: text("page_status", {
    enum: ["draft", "published", "archived"],
  })
    .notNull()
    .default("draft"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── INTERNAL LINKS ───
export const internalLinks = sqliteTable("internal_links", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  fromPageId: text("from_page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  toPageId: text("to_page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  anchorText: text("anchor_text").notNull(),
  position: text("position"), // e.g. "body", "sidebar", "footer"
});

// ─── COMPETITORS ───
export const competitors = sqliteTable("competitors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  handle: text("handle"),
  url: text("url"),
  niche: text("niche"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── COMPETITOR POSTS ───
export const competitorPosts = sqliteTable("competitor_posts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  competitorId: text("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  postUrl: text("post_url"),
  postDate: integer("post_date", { mode: "timestamp" }),
  content: text("content"),
  metrics: text("metrics"), // JSON: likes, shares, comments, views
  aiAnalysis: text("ai_analysis"), // Claude's analysis
  tags: text("tags"), // JSON array
  scrapedAt: integer("scraped_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ═══════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
  ownedWorkspaces: many(workspaces),
  sessions: many(sessions),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  members: many(workspaceMembers),
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  })
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Phase 2 Relations
export const brandProfilesRelations = relations(
  brandProfiles,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [brandProfiles.workspaceId],
      references: [workspaces.id],
    }),
    colors: many(brandColors),
    assets: many(brandAssets),
  })
);

export const brandColorsRelations = relations(brandColors, ({ one }) => ({
  brand: one(brandProfiles, {
    fields: [brandColors.brandId],
    references: [brandProfiles.id],
  }),
}));

export const brandAssetsRelations = relations(brandAssets, ({ one }) => ({
  brand: one(brandProfiles, {
    fields: [brandAssets.brandId],
    references: [brandProfiles.id],
  }),
}));

export const contentProjectsRelations = relations(
  contentProjects,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [contentProjects.workspaceId],
      references: [workspaces.id],
    }),
    creator: one(users, {
      fields: [contentProjects.createdBy],
      references: [users.id],
    }),
    assets: many(contentAssets),
  })
);

export const contentAssetsRelations = relations(
  contentAssets,
  ({ one }) => ({
    project: one(contentProjects, {
      fields: [contentAssets.projectId],
      references: [contentProjects.id],
    }),
  })
);

export const mediaJobsRelations = relations(mediaJobs, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [mediaJobs.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [mediaJobs.createdBy],
    references: [users.id],
  }),
  voiceProfile: one(voiceProfiles, {
    fields: [mediaJobs.voiceProfileId],
    references: [voiceProfiles.id],
  }),
}));

export const voiceProfilesRelations = relations(voiceProfiles, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [voiceProfiles.workspaceId],
    references: [workspaces.id],
  }),
}));

// Phase 3 Relations
export const connectedAccountsRelations = relations(
  connectedAccounts,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [connectedAccounts.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [connectedAccounts.userId],
      references: [users.id],
    }),
    scheduledPosts: many(scheduledPosts),
  })
);

export const scheduledPostsRelations = relations(
  scheduledPosts,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [scheduledPosts.workspaceId],
      references: [workspaces.id],
    }),
    contentAsset: one(contentAssets, {
      fields: [scheduledPosts.contentAssetId],
      references: [contentAssets.id],
    }),
    connectedAccount: one(connectedAccounts, {
      fields: [scheduledPosts.connectedAccountId],
      references: [connectedAccounts.id],
    }),
    creator: one(users, {
      fields: [scheduledPosts.createdBy],
      references: [users.id],
    }),
    approver: one(users, {
      fields: [scheduledPosts.approvedBy],
      references: [users.id],
    }),
  })
);

// ═══════════════════════════════════════════
// Phase 5: Analytics + Billing Tables
// ═══════════════════════════════════════════

// ─── POST METRICS ───
export const postMetrics = sqliteTable("post_metrics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  postId: text("post_id")
    .notNull()
    .references(() => scheduledPosts.id, { onDelete: "cascade" }),
  impressions: integer("impressions").default(0),
  reach: integer("reach").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  saves: integer("saves").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  engagementRate: text("engagement_rate"), // Calculated: (likes+comments+shares)/reach
  // Video realism trust analytics
  sentimentScore: real("sentiment_score"), // -1.0 to 1.0 aggregate comment sentiment
  trustFlag: text("trust_flag", {
    enum: ["trusted", "suspect", "flagged"],
  }), // AI-assessed realism perception
  fetchedAt: integer("fetched_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SUBSCRIPTIONS ───
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripePriceId: text("stripe_price_id").notNull(),
  status: text("status", {
    enum: ["active", "past_due", "canceled", "trialing", "incomplete"],
  }).notNull(),
  currentPeriodStart: integer("current_period_start", { mode: "timestamp" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── USAGE RECORDS ───
export const usageRecords = sqliteTable("usage_records", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  metric: text("metric", {
    enum: ["content_generated", "media_generated", "posts_published", "api_calls"],
  }).notNull(),
  count: integer("count").notNull().default(1),
  periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
  periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
});

// Phase 4 Relations
export const keywordsRelations = relations(keywords, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [keywords.workspaceId],
    references: [workspaces.id],
  }),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [pages.workspaceId],
    references: [workspaces.id],
  }),
  outgoingLinks: many(internalLinks),
}));

export const internalLinksRelations = relations(
  internalLinks,
  ({ one }) => ({
    fromPage: one(pages, {
      fields: [internalLinks.fromPageId],
      references: [pages.id],
      relationName: "outgoing",
    }),
    toPage: one(pages, {
      fields: [internalLinks.toPageId],
      references: [pages.id],
      relationName: "incoming",
    }),
  })
);

export const competitorsRelations = relations(
  competitors,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [competitors.workspaceId],
      references: [workspaces.id],
    }),
    posts: many(competitorPosts),
  })
);

export const competitorPostsRelations = relations(
  competitorPosts,
  ({ one }) => ({
    competitor: one(competitors, {
      fields: [competitorPosts.competitorId],
      references: [competitors.id],
    }),
  })
);

// ═══════════════════════════════════════════
// Phase 6: Ads + Reunion API Tables
// ═══════════════════════════════════════════

// ─── AD CAMPAIGNS ───
export const adCampaigns = sqliteTable("ad_campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  platform: text("platform", {
    enum: ["meta", "google", "x"],
  }).notNull(),
  name: text("name").notNull(),
  objective: text("objective", {
    enum: ["awareness", "traffic", "engagement", "conversions", "app_installs"],
  }).notNull(),
  campaignStatus: text("campaign_status", {
    enum: ["draft", "active", "paused", "completed", "archived"],
  })
    .notNull()
    .default("draft"),
  budgetDaily: real("budget_daily"), // cents
  budgetTotal: real("budget_total"), // cents
  spend: real("spend").default(0),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  startDate: integer("start_date", { mode: "timestamp" }),
  endDate: integer("end_date", { mode: "timestamp" }),
  targeting: text("targeting"), // JSON: audience targeting config
  creativeAssetId: text("creative_asset_id").references(() => contentAssets.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── AD VARIANTS ───
export const adVariants = sqliteTable("ad_variants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => adCampaigns.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  body: text("body").notNull(),
  imageR2Key: text("image_r2_key"),
  ctaText: text("cta_text"),
  landingUrl: text("landing_url"),
  isWinner: integer("is_winner", { mode: "boolean" }).default(false),
});

// ─── REUNION CAMPAIGNS ───
export const reunionCampaigns = sqliteTable("reunion_campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["push", "invite_reminder", "reactivation", "announcement", "onboarding"],
  }).notNull(),
  name: text("name").notNull(),
  segment: text("segment"), // JSON: targeting rules
  content: text("content"), // JSON: title, body, cta, deeplink
  campaignStatus: text("campaign_status", {
    enum: ["draft", "scheduled", "active", "paused", "completed"],
  })
    .notNull()
    .default("draft"),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
  sentCount: integer("sent_count").default(0),
  openedCount: integer("opened_count").default(0),
  clickedCount: integer("clicked_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Phase 5 Relations
export const postMetricsRelations = relations(postMetrics, ({ one }) => ({
  post: one(scheduledPosts, {
    fields: [postMetrics.postId],
    references: [scheduledPosts.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [subscriptions.workspaceId],
    references: [workspaces.id],
  }),
}));

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [usageRecords.workspaceId],
    references: [workspaces.id],
  }),
}));

// Phase 6 Relations
export const adCampaignsRelations = relations(
  adCampaigns,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [adCampaigns.workspaceId],
      references: [workspaces.id],
    }),
    creativeAsset: one(contentAssets, {
      fields: [adCampaigns.creativeAssetId],
      references: [contentAssets.id],
    }),
    variants: many(adVariants),
  })
);

export const adVariantsRelations = relations(adVariants, ({ one }) => ({
  campaign: one(adCampaigns, {
    fields: [adVariants.campaignId],
    references: [adCampaigns.id],
  }),
}));

export const reunionCampaignsRelations = relations(
  reunionCampaigns,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [reunionCampaigns.workspaceId],
      references: [workspaces.id],
    }),
  })
);

// ═══════════════════════════════════════════
// Phase 7: Community Engine + Newsletter
// ═══════════════════════════════════════════

// ─── COMMUNITIES ───
export const communities = sqliteTable("communities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  platform: text("platform", {
    enum: ["facebook", "reddit", "discord", "slack"],
  }).notNull(),
  platformId: text("platform_id"), // External group/channel ID
  name: text("name").notNull(),
  description: text("description"),
  memberCount: integer("member_count").default(0),
  postCount: integer("post_count").default(0),
  connectedAccountId: text("connected_account_id").references(() => connectedAccounts.id),
  communityStatus: text("community_status", {
    enum: ["active", "paused", "archived"],
  })
    .notNull()
    .default("active"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── COMMUNITY POSTS ───
export const communityPosts = sqliteTable("community_posts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title"),
  body: text("body").notNull(),
  postType: text("post_type", {
    enum: ["text", "image", "link", "poll", "video"],
  })
    .notNull()
    .default("text"),
  platformPostId: text("platform_post_id"),
  postStatus: text("post_status", {
    enum: ["draft", "scheduled", "published", "failed"],
  })
    .notNull()
    .default("draft"),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── COMMUNITY MEMBERS (tracking) ───
export const communityMembers = sqliteTable("community_members", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  platformUserId: text("platform_user_id").notNull(),
  displayName: text("display_name"),
  role: text("role", { enum: ["member", "moderator", "admin"] }).default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  engagementScore: integer("engagement_score").default(0),
});

// ─── SUBSCRIBERS (Newsletter) ───
export const subscribers = sqliteTable("subscribers", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  tags: text("tags"), // JSON array
  source: text("source", {
    enum: ["waitlist", "newsletter", "lead_magnet", "manual", "import"],
  })
    .notNull()
    .default("manual"),
  subscriberStatus: text("subscriber_status", {
    enum: ["active", "unsubscribed", "bounced"],
  })
    .notNull()
    .default("active"),
  leadMagnetSlug: text("lead_magnet_slug"), // Which lead magnet they opted into
  subscribedAt: integer("subscribed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp" }),
});

// ─── NEWSLETTERS ───
export const newsletters = sqliteTable("newsletters", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  previewText: text("preview_text"),
  htmlContent: text("html_content"),
  textContent: text("text_content"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  targetTags: text("target_tags"), // JSON: send to subscribers with these tags
  newsletterStatus: text("newsletter_status", {
    enum: ["draft", "sending", "sent", "failed"],
  })
    .notNull()
    .default("draft"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  sentCount: integer("sent_count").default(0),
  openedCount: integer("opened_count").default(0),
  clickedCount: integer("clicked_count").default(0),
  bouncedCount: integer("bounced_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── LEAD MAGNETS ───
export const leadMagnets = sqliteTable("lead_magnets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  coverUrl: text("cover_url"),
  downloads: integer("downloads").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── AUTOMATIONS ───
export const automations = sqliteTable("automations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: text("trigger_type", {
    enum: ["subscribe", "tag_added", "lead_magnet", "manual"],
  }).notNull(),
  triggerConfig: text("trigger_config"),
  steps: text("steps").notNull(),
  automationStatus: text("automation_status", {
    enum: ["draft", "active", "paused"],
  })
    .notNull()
    .default("draft"),
  enrolledCount: integer("enrolled_count").default(0),
  completedCount: integer("completed_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Phase 7 Relations
export const communitiesRelations = relations(communities, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [communities.workspaceId],
    references: [workspaces.id],
  }),
  posts: many(communityPosts),
  members: many(communityMembers),
}));

export const communityPostsRelations = relations(communityPosts, ({ one }) => ({
  community: one(communities, {
    fields: [communityPosts.communityId],
    references: [communities.id],
  }),
}));

export const communityMembersRelations = relations(communityMembers, ({ one }) => ({
  community: one(communities, {
    fields: [communityMembers.communityId],
    references: [communities.id],
  }),
}));

export const subscribersRelations = relations(subscribers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [subscribers.workspaceId],
    references: [workspaces.id],
  }),
}));

export const newslettersRelations = relations(newsletters, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [newsletters.workspaceId],
    references: [workspaces.id],
  }),
}));

export const leadMagnetsRelations = relations(leadMagnets, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [leadMagnets.workspaceId],
    references: [workspaces.id],
  }),
}));

export const automationsRelations = relations(automations, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [automations.workspaceId],
    references: [workspaces.id],
  }),
  enrollments: many(automationEnrollments),
}));

// ─── AUTOMATION ENROLLMENTS ───

export const automationEnrollments = sqliteTable("automation_enrollments", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  subscriberId: text("subscriber_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  currentStep: integer("current_step").notNull().default(0),
  enrollmentStatus: text("enrollment_status", {
    enum: ["active", "completed", "failed", "cancelled"],
  }).notNull().default("active"),
  nextStepAt: integer("next_step_at"),  // unix ms; null = run immediately
  enrolledAt: integer("enrolled_at").notNull().$defaultFn(() => Date.now()),
  completedAt: integer("completed_at"),
  errorMessage: text("error_message"),
});

export const automationEnrollmentsRelations = relations(automationEnrollments, ({ one }) => ({
  automation: one(automations, {
    fields: [automationEnrollments.automationId],
    references: [automations.id],
  }),
}));

export type AutomationEnrollment = typeof automationEnrollments.$inferSelect;
export type NewAutomationEnrollment = typeof automationEnrollments.$inferInsert;

// ═══════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════

// Phase 1
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;

export type Role = WorkspaceMember["role"];
export type Plan = Workspace["plan"];

// Phase 2
export type BrandProfile = typeof brandProfiles.$inferSelect;
export type NewBrandProfile = typeof brandProfiles.$inferInsert;
export type BrandColor = typeof brandColors.$inferSelect;
export type NewBrandColor = typeof brandColors.$inferInsert;
export type BrandAsset = typeof brandAssets.$inferSelect;
export type NewBrandAsset = typeof brandAssets.$inferInsert;
export type DoctrineProfile = typeof doctrineProfiles.$inferSelect;
export type ContentProject = typeof contentProjects.$inferSelect;
export type NewContentProject = typeof contentProjects.$inferInsert;
export type ContentAsset = typeof contentAssets.$inferSelect;
export type NewContentAsset = typeof contentAssets.$inferInsert;
export type MediaJob = typeof mediaJobs.$inferSelect;
export type NewMediaJob = typeof mediaJobs.$inferInsert;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type NewVoiceProfile = typeof voiceProfiles.$inferInsert;

// Phase 3
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type NewConnectedAccount = typeof connectedAccounts.$inferInsert;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type NewScheduledPost = typeof scheduledPosts.$inferInsert;
export type SocialPlatformType = ConnectedAccount["platform"];

// Phase 4
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Page = typeof pages.$inferSelect;
export type NewPage = typeof pages.$inferInsert;
export type InternalLink = typeof internalLinks.$inferSelect;
export type NewInternalLink = typeof internalLinks.$inferInsert;
export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;
export type CompetitorPost = typeof competitorPosts.$inferSelect;
export type NewCompetitorPost = typeof competitorPosts.$inferInsert;

// Phase 5
export type PostMetric = typeof postMetrics.$inferSelect;
export type NewPostMetric = typeof postMetrics.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;

// Phase 6
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type NewAdCampaign = typeof adCampaigns.$inferInsert;
export type AdVariant = typeof adVariants.$inferSelect;
export type NewAdVariant = typeof adVariants.$inferInsert;
export type ReunionCampaign = typeof reunionCampaigns.$inferSelect;
export type NewReunionCampaign = typeof reunionCampaigns.$inferInsert;

// ═══════════════════════════════════════════
// Phase 11: Growth Swarm Engine
// ═══════════════════════════════════════════

// ─── SWARM AGENTS ───
export const swarmAgents = sqliteTable("swarm_agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role", {
    enum: [
      "strategist",
      "content",
      "video",
      "ads",
      "outreach",
      "analytics",
      "competitor",
      "founder_voice",
    ],
  }).notNull(),
  modelProvider: text("model_provider", {
    enum: ["anthropic", "openai", "together", "cloudflare"],
  })
    .notNull()
    .default("anthropic"),
  systemPrompt: text("system_prompt"),
  temperature: real("temperature").notNull().default(0.7),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SWARM MISSIONS ───
export const swarmMissions = sqliteTable("swarm_missions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  status: text("status", {
    enum: ["planning", "active", "paused", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("planning"),
  priority: text("priority", {
    enum: ["critical", "high", "medium", "low"],
  })
    .notNull()
    .default("medium"),
  targetMetric: text("target_metric"),
  targetValue: real("target_value"),
  currentValue: real("current_value").default(0),
  overnightEligible: integer("overnight_eligible", { mode: "boolean" })
    .notNull()
    .default(false),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ─── SWARM TASKS ───
export const swarmTasks = sqliteTable("swarm_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  missionId: text("mission_id")
    .notNull()
    .references(() => swarmMissions.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => swarmAgents.id, { onDelete: "cascade" }),
  taskType: text("task_type", {
    enum: [
      "generate_content",
      "analyze_metrics",
      "create_campaign",
      "optimize_ads",
      "research_competitors",
      "send_outreach",
      "generate_video",
      "plan_strategy",
      "review_brand_voice",
      "schedule_post",
      "summarize",
      "recommend",
    ],
  }).notNull(),
  inputJson: text("input_json").notNull().default("{}"),
  outputJson: text("output_json"),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed", "skipped"],
  })
    .notNull()
    .default("queued"),
  score: real("score"),
  tokensUsed: integer("tokens_used").default(0),
  costCents: integer("cost_cents").default(0),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ─── SWARM LOGS ───
export const swarmLogs = sqliteTable("swarm_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  missionId: text("mission_id").references(() => swarmMissions.id, {
    onDelete: "cascade",
  }),
  agentId: text("agent_id").references(() => swarmAgents.id, {
    onDelete: "set null",
  }),
  taskId: text("task_id").references(() => swarmTasks.id, {
    onDelete: "set null",
  }),
  message: text("message").notNull(),
  level: text("level", {
    enum: ["debug", "info", "warn", "error"],
  })
    .notNull()
    .default("info"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SWARM RELATIONS ───
export const swarmAgentsRelations = relations(swarmAgents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [swarmAgents.workspaceId],
    references: [workspaces.id],
  }),
  tasks: many(swarmTasks),
}));

export const swarmMissionsRelations = relations(
  swarmMissions,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [swarmMissions.workspaceId],
      references: [workspaces.id],
    }),
    createdByUser: one(users, {
      fields: [swarmMissions.createdBy],
      references: [users.id],
    }),
    tasks: many(swarmTasks),
    logs: many(swarmLogs),
  })
);

export const swarmTasksRelations = relations(swarmTasks, ({ one }) => ({
  mission: one(swarmMissions, {
    fields: [swarmTasks.missionId],
    references: [swarmMissions.id],
  }),
  agent: one(swarmAgents, {
    fields: [swarmTasks.agentId],
    references: [swarmAgents.id],
  }),
}));

export const swarmLogsRelations = relations(swarmLogs, ({ one }) => ({
  mission: one(swarmMissions, {
    fields: [swarmLogs.missionId],
    references: [swarmMissions.id],
  }),
  agent: one(swarmAgents, {
    fields: [swarmLogs.agentId],
    references: [swarmAgents.id],
  }),
  task: one(swarmTasks, {
    fields: [swarmLogs.taskId],
    references: [swarmTasks.id],
  }),
}));

// Phase 7
export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;
export type CommunityPost = typeof communityPosts.$inferSelect;
export type NewCommunityPost = typeof communityPosts.$inferInsert;
export type CommunityMember = typeof communityMembers.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type Newsletter = typeof newsletters.$inferSelect;
export type NewNewsletter = typeof newsletters.$inferInsert;
export type LeadMagnet = typeof leadMagnets.$inferSelect;
export type NewLeadMagnet = typeof leadMagnets.$inferInsert;
export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;

// Phase 11
export type SwarmAgent = typeof swarmAgents.$inferSelect;
export type NewSwarmAgent = typeof swarmAgents.$inferInsert;
export type SwarmMission = typeof swarmMissions.$inferSelect;
export type NewSwarmMission = typeof swarmMissions.$inferInsert;
export type SwarmTask = typeof swarmTasks.$inferSelect;
export type NewSwarmTask = typeof swarmTasks.$inferInsert;
export type SwarmLog = typeof swarmLogs.$inferSelect;
export type NewSwarmLog = typeof swarmLogs.$inferInsert;

// ═══════════════════════════════════════════
// Phase 12: Growth Optimization Engine
// ═══════════════════════════════════════════

export const growthExperiments = sqliteTable("growth_experiments", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  moduleSource: text("module_source").notNull(),
  campaignId: text("campaign_id"),
  experimentType: text("experiment_type").notNull().default("ab"),
  status: text("status").notNull().default("draft"),
  objectiveMetric: text("objective_metric").notNull(),
  confidenceThreshold: real("confidence_threshold").notNull().default(0.95),
  autoPromoteWinner: integer("auto_promote_winner", { mode: "boolean" }).notNull().default(false),
  autoKillLosers: integer("auto_kill_losers", { mode: "boolean" }).notNull().default(false),
  trafficStrategy: text("traffic_strategy").notNull().default("equal"),
  minSampleSize: integer("min_sample_size").notNull().default(100),
  budgetCapCents: integer("budget_cap_cents"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const growthVariants = sqliteTable("growth_variants", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  experimentId: text("experiment_id").notNull(),
  label: text("label").notNull(),
  allocationPercent: real("allocation_percent").notNull().default(50),
  contentJson: text("content_json").notNull().default("{}"),
  isControl: integer("is_control", { mode: "boolean" }).notNull().default(false),
  aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  impressions: integer("impressions").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const growthEvents = sqliteTable("growth_events", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  experimentId: text("experiment_id").notNull(),
  variantId: text("variant_id").notNull(),
  eventType: text("event_type").notNull(),
  revenueValueCents: integer("revenue_value_cents").default(0),
  userHash: text("user_hash").notNull(),
  metadataJson: text("metadata_json").default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const growthResults = sqliteTable("growth_results", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  experimentId: text("experiment_id").notNull(),
  winningVariantId: text("winning_variant_id"),
  confidenceScore: real("confidence_score").notNull().default(0),
  liftPercent: real("lift_percent").notNull().default(0),
  estimatedRevenueGainCents: integer("estimated_revenue_gain_cents").notNull().default(0),
  testMethod: text("test_method").notNull().default("z_test"),
  sampleSizeControl: integer("sample_size_control").notNull().default(0),
  sampleSizeVariant: integer("sample_size_variant").notNull().default(0),
  pValue: real("p_value"),
  effectSize: real("effect_size"),
  power: real("power"),
  autoResolved: integer("auto_resolved", { mode: "boolean" }).notNull().default(false),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const growthInsights = sqliteTable("growth_insights", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  category: text("category").notNull(),
  finding: text("finding").notNull(),
  confidenceScore: real("confidence_score").notNull().default(0),
  liftPercent: real("lift_percent"),
  sampleSize: integer("sample_size"),
  sourceExperimentIds: text("source_experiment_ids").notNull().default("[]"),
  moduleSource: text("module_source"),
  applicableIndustries: text("applicable_industries").default("[]"),
  timesValidated: integer("times_validated").notNull().default(1),
  lastValidatedAt: text("last_validated_at"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const growthAuditLog = sqliteTable("growth_audit_log", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  experimentId: text("experiment_id"),
  action: text("action").notNull(),
  actor: text("actor").notNull().default("system"),
  detailsJson: text("details_json").default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

// ─── Growth Engine Relations ───

export const growthExperimentsRelations = relations(growthExperiments, ({ many }) => ({
  variants: many(growthVariants),
  events: many(growthEvents),
  results: many(growthResults),
  auditEntries: many(growthAuditLog),
}));

export const growthVariantsRelations = relations(growthVariants, ({ one }) => ({
  experiment: one(growthExperiments, {
    fields: [growthVariants.experimentId],
    references: [growthExperiments.id],
  }),
}));

export const growthEventsRelations = relations(growthEvents, ({ one }) => ({
  experiment: one(growthExperiments, {
    fields: [growthEvents.experimentId],
    references: [growthExperiments.id],
  }),
  variant: one(growthVariants, {
    fields: [growthEvents.variantId],
    references: [growthVariants.id],
  }),
}));

export const growthResultsRelations = relations(growthResults, ({ one }) => ({
  experiment: one(growthExperiments, {
    fields: [growthResults.experimentId],
    references: [growthExperiments.id],
  }),
  winningVariant: one(growthVariants, {
    fields: [growthResults.winningVariantId],
    references: [growthVariants.id],
  }),
}));

export const growthAuditLogRelations = relations(growthAuditLog, ({ one }) => ({
  experiment: one(growthExperiments, {
    fields: [growthAuditLog.experimentId],
    references: [growthExperiments.id],
  }),
}));

// ─── Growth Engine Type Exports ───
export type GrowthExperimentRow = typeof growthExperiments.$inferSelect;
export type NewGrowthExperiment = typeof growthExperiments.$inferInsert;
export type GrowthVariantRow = typeof growthVariants.$inferSelect;
export type NewGrowthVariant = typeof growthVariants.$inferInsert;
export type GrowthEventRow = typeof growthEvents.$inferSelect;
export type NewGrowthEvent = typeof growthEvents.$inferInsert;
export type GrowthResultRow = typeof growthResults.$inferSelect;
export type NewGrowthResult = typeof growthResults.$inferInsert;
export type GrowthInsightRow = typeof growthInsights.$inferSelect;
export type NewGrowthInsight = typeof growthInsights.$inferInsert;
export type GrowthAuditLogRow = typeof growthAuditLog.$inferSelect;
export type NewGrowthAuditLog = typeof growthAuditLog.$inferInsert;

// ═══════════════════════════════════════════
// Phase 14: Social Listening & Opportunity Intelligence
// ═══════════════════════════════════════════

// ─── LISTENING SOURCES ───
export const listeningSources = sqliteTable("listening_sources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  sourceType: text("source_type").notNull(), // 'reddit' | 'x' | 'google_news' | 'rss' | 'youtube' | 'forum'
  name: text("name").notNull(),
  config: text("config").notNull().default("{}"), // JSON config
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastScannedAt: integer("last_scanned_at", { mode: "timestamp" }),
  scanFrequencyMinutes: integer("scan_frequency_minutes").notNull().default(60),
  errorCount: integer("error_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── TRACKED KEYWORDS ───
export const trackedKeywords = sqliteTable("tracked_keywords", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  keyword: text("keyword").notNull(),
  keywordType: text("keyword_type").notNull().default("brand"), // 'brand' | 'competitor' | 'industry' | 'opportunity' | 'local'
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  matchCount: integer("match_count").notNull().default(0),
  lastMatchedAt: integer("last_matched_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SIGNALS ───
export const signals = sqliteTable("signals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  sourceId: text("source_id"),
  keywordId: text("keyword_id"),

  // Signal classification
  signalType: text("signal_type").notNull(), // 10 signal types
  priorityScore: integer("priority_score").notNull().default(50),
  intent: text("intent"), // AI-classified intent

  // Source content
  sourcePlatform: text("source_platform").notNull(),
  sourceUrl: text("source_url"),
  sourceAuthor: text("source_author"),
  sourceAuthorFollowers: integer("source_author_followers"),
  title: text("title"),
  contentSnippet: text("content_snippet").notNull(),
  originalContent: text("original_content"),

  // AI analysis
  aiSummary: text("ai_summary"),
  aiSuggestedResponse: text("ai_suggested_response"),
  aiSentiment: real("ai_sentiment"),
  aiRelevanceScore: real("ai_relevance_score"),
  aiTags: text("ai_tags"), // JSON array

  // Status tracking
  status: text("status").notNull().default("new"),
  actionedType: text("actioned_type"),
  actionedAt: integer("actioned_at", { mode: "timestamp" }),
  actionedBy: text("actioned_by"),
  convertedContentId: text("converted_content_id"),
  convertedSwarmMissionId: text("converted_swarm_mission_id"),

  // Engagement metrics
  engagementLikes: integer("engagement_likes").default(0),
  engagementComments: integer("engagement_comments").default(0),
  engagementShares: integer("engagement_shares").default(0),
  engagementScore: real("engagement_score").default(0),

  // Timestamps
  detectedAt: integer("detected_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  sourcePublishedAt: integer("source_published_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── ENGAGEMENT ACTIONS ───
export const engagementActions = sqliteTable("engagement_actions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  signalId: text("signal_id").notNull(),
  actionType: text("action_type").notNull(), // 'reply' | 'dm' | 'follow' | 'like' | 'repost' | 'draft_content' | 'launch_swarm'
  platform: text("platform").notNull(),
  content: text("content"),
  aiDrafted: integer("ai_drafted", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("draft"), // 'draft' | 'sent' | 'failed'
  sentAt: integer("sent_at", { mode: "timestamp" }),
  responseReceived: integer("response_received", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SIGNAL ALERTS ───
export const signalAlerts = sqliteTable("signal_alerts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  alertType: text("alert_type").notNull(), // 'brand_mention' | 'high_priority' | 'negative_sentiment' | 'viral_trend' | 'competitor_alert' | 'lead_detected'
  conditions: text("conditions").notNull().default("{}"), // JSON conditions
  notifyMethod: text("notify_method").notNull().default("in_app"),
  notifyTarget: text("notify_target"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp" }),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Social Listening Relations ───
export const listeningSourcesRelations = relations(listeningSources, ({ many }) => ({
  signals: many(signals),
}));

export const trackedKeywordsRelations = relations(trackedKeywords, ({ many }) => ({
  signals: many(signals),
}));

export const signalsRelations = relations(signals, ({ one, many }) => ({
  source: one(listeningSources, {
    fields: [signals.sourceId],
    references: [listeningSources.id],
  }),
  keyword: one(trackedKeywords, {
    fields: [signals.keywordId],
    references: [trackedKeywords.id],
  }),
  actionedByUser: one(users, {
    fields: [signals.actionedBy],
    references: [users.id],
  }),
  engagementActions: many(engagementActions),
}));

export const engagementActionsRelations = relations(engagementActions, ({ one }) => ({
  signal: one(signals, {
    fields: [engagementActions.signalId],
    references: [signals.id],
  }),
}));

// ─── Social Listening Type Exports ───
export type ListeningSourceRow = typeof listeningSources.$inferSelect;
export type NewListeningSource = typeof listeningSources.$inferInsert;
export type TrackedKeywordRow = typeof trackedKeywords.$inferSelect;
export type NewTrackedKeyword = typeof trackedKeywords.$inferInsert;
export type SignalRow = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;
export type EngagementActionRow = typeof engagementActions.$inferSelect;
export type NewEngagementAction = typeof engagementActions.$inferInsert;
export type SignalAlertRow = typeof signalAlerts.$inferSelect;
export type NewSignalAlert = typeof signalAlerts.$inferInsert;

// ═══════════════════════════════════════════
// Phase: JV Marketing & Referral Tracking
// ═══════════════════════════════════════════

// ─── PARTNERS ───
export const partners = sqliteTable("partners", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  companyName: text("company_name"),
  partnerType: text("partner_type", {
    enum: ["influencer", "podcast", "creator", "affiliate", "family_org", "church", "community", "media"],
  }).notNull().default("affiliate"),
  status: text("status", { enum: ["active", "paused", "archived"] }).notNull().default("active"),
  notes: text("notes"),
  websiteUrl: text("website_url"),
  socialHandle: text("social_handle"),
  qualityScore: real("quality_score").default(0),
  totalClicks: integer("total_clicks").default(0),
  totalSignups: integer("total_signups").default(0),
  totalRevenue: real("total_revenue").default(0),
  payoutOwed: real("payout_owed").default(0),
  payoutPaid: real("payout_paid").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── PARTNER CAMPAIGNS ───
export const partnerCampaigns = sqliteTable("partner_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  campaignName: text("campaign_name").notNull(),
  campaignSlug: text("campaign_slug"),
  landingPageUrl: text("landing_page_url").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  status: text("status", { enum: ["active", "paused", "expired"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── TRACKING LINKS ───
export const trackingLinks = sqliteTable("tracking_links", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").references(() => partnerCampaigns.id, { onDelete: "set null" }),
  shortCode: text("short_code").notNull().unique(),
  destinationUrl: text("destination_url").notNull(),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  attributionWindowDays: integer("attribution_window_days").notNull().default(30),
  clickCount: integer("click_count").default(0),
  uniqueClickCount: integer("unique_click_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── REFERRAL VISITS ───
export const referralVisits = sqliteTable("referral_visits", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  trackingLinkId: text("tracking_link_id").notNull().references(() => trackingLinks.id, { onDelete: "cascade" }),
  partnerId: text("partner_id").notNull(),
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
  referrer: text("referrer"),
  country: text("country"),
  deviceType: text("device_type", { enum: ["desktop", "mobile", "tablet", "bot", "unknown"] }),
  sessionId: text("session_id"),
  isSuspicious: integer("is_suspicious", { mode: "boolean" }).default(false),
  fraudReason: text("fraud_reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── ATTRIBUTED CONVERSIONS ───
export const attributedConversions = sqliteTable("attributed_conversions", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  trackingLinkId: text("tracking_link_id").notNull().references(() => trackingLinks.id, { onDelete: "cascade" }),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  conversionType: text("conversion_type", {
    enum: ["signup", "subscription", "purchase", "family_invite", "family_activation"],
  }).notNull().default("signup"),
  conversionValue: real("conversion_value").default(0),
  userId: text("user_id"),
  attributionChain: text("attribution_chain"), // JSON
  status: text("status", { enum: ["pending", "confirmed", "rejected"] }).notNull().default("pending"),
  confirmationDays: integer("confirmation_days").default(14),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  commissionAmount: real("commission_amount").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── COMMISSION RULES ───
export const commissionRules = sqliteTable("commission_rules", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  partnerId: text("partner_id").references(() => partners.id, { onDelete: "cascade" }),
  ruleType: text("rule_type", { enum: ["flat_fee", "percentage", "tiered"] }).notNull().default("flat_fee"),
  value: real("value").notNull().default(0),
  conversionType: text("conversion_type"),
  milestones: text("milestones"), // JSON: [{min_conversions, bonus_amount}]
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── PARTNER PAYOUTS ───
export const partnerPayouts = sqliteTable("partner_payouts", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workspaceId: text("workspace_id").notNull(),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  payoutMethod: text("payout_method", { enum: ["paypal", "bank", "stripe", "check", "crypto", "other"] }),
  payoutReference: text("payout_reference"),
  status: text("status", { enum: ["pending", "paid", "failed"] }).notNull().default("pending"),
  note: text("note"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── PARTNER QUALITY SNAPSHOTS ───
export const partnerQualitySnapshots = sqliteTable("partner_quality_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  partnerId: text("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull(),
  retentionScore: real("retention_score").default(0),
  activationScore: real("activation_score").default(0),
  referralScore: real("referral_score").default(0),
  conversionRateScore: real("conversion_rate_score").default(0),
  churnScore: real("churn_score").default(0),
  qualityScore: real("quality_score").default(0),
  signups30d: integer("signups_30d").default(0),
  activeUsers30d: integer("active_users_30d").default(0),
  snapshotAt: integer("snapshot_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ─── JV Relations ───
export const partnersRelations = relations(partners, ({ many }) => ({
  campaigns: many(partnerCampaigns),
  trackingLinks: many(trackingLinks),
  conversions: many(attributedConversions),
  payouts: many(partnerPayouts),
  qualitySnapshots: many(partnerQualitySnapshots),
}));

export const partnerCampaignsRelations = relations(partnerCampaigns, ({ one, many }) => ({
  partner: one(partners, { fields: [partnerCampaigns.partnerId], references: [partners.id] }),
  trackingLinks: many(trackingLinks),
}));

export const trackingLinksRelations = relations(trackingLinks, ({ one, many }) => ({
  partner: one(partners, { fields: [trackingLinks.partnerId], references: [partners.id] }),
  campaign: one(partnerCampaigns, { fields: [trackingLinks.campaignId], references: [partnerCampaigns.id] }),
  visits: many(referralVisits),
  conversions: many(attributedConversions),
}));

// ─── JV Type Exports ───
export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
export type PartnerCampaign = typeof partnerCampaigns.$inferSelect;
export type TrackingLink = typeof trackingLinks.$inferSelect;
export type ReferralVisit = typeof referralVisits.$inferSelect;
export type AttributedConversion = typeof attributedConversions.$inferSelect;
export type CommissionRule = typeof commissionRules.$inferSelect;
export type PartnerPayout = typeof partnerPayouts.$inferSelect;
export type PartnerQualitySnapshot = typeof partnerQualitySnapshots.$inferSelect;
