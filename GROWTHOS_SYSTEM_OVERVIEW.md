# GrowthOS — Complete System Overview

*Technical architecture, ecosystem vision, content creation pipeline, and AI platform intelligence.*

---

## Part 1 — The Ecosystem Vision

GrowthOS is not a social media scheduler. It is an **autonomous growth organism** — a self-improving system that finds audiences where they already live, earns their trust through authentic presence, captures them into a funnel, and compounds intelligence over time. Every module is a layer in a five-layer loop that runs on autopilot.

### The Five-Layer Loop

**Layer 1 — Discovery**
The Signals engine monitors Reddit, X, Google News, RSS feeds, and forums for conversations relevant to a brand. For Reunion specifically, this means tracking threads about family estrangement, family challenge ideas, reunion planning, shared memories, and community-building. The system scores each signal by priority, intent (buying, researching, asking, complaining), sentiment, and relevance. High-priority signals surface in the dashboard and can trigger Swarm tasks automatically.

**Layer 2 — Influence**
Once you know where conversations are happening, you do two things simultaneously. The Publisher places the brand's voice into those communities — curated posts, reactions, and replies that add genuine value and subtly carry the brand message. In parallel, Influencers who are already trusted members of those communities are activated via Social Cat or discovered directly through signal monitoring. They carry the message organically. Together, community posting and influencer activation create a surround-sound effect in the spaces your audience already trusts.

**Layer 3 — Capture**
People who engage get funneled in. AEO (Answer Engine Optimization) puts the brand inside AI answer engines — when someone asks Perplexity or ChatGPT "how do I plan a family reunion," GrowthOS-optimized content appears as the answer. SEO does the same for traditional search. Funnels convert inbound traffic into leads: email subscribers, trial signups, or direct purchases. The Newsletter nurtures captured leads on an ongoing basis.

**Layer 4 — Nurture**
Once you have someone's contact information, Automations take over. Multi-step sequences fire based on behavior, time delays, and triggers. A person who signs up from a Reddit thread gets a different nurture path than someone who found you via SEO. The Automations engine tracks enrollment state in D1 and processes steps asynchronously via a dedicated Worker, so nothing blocks and nothing falls through the cracks.

**Layer 5 — Optimize**
The Growth Optimization Engine (GOE) runs statistical A/B tests on every variable — which hook lands in which community, which influencer drives conversions, which content format generates saves versus shares. It uses a configurable statistical model (frequentist or Bayesian) to auto-promote winners when confidence thresholds are met. The Insight Moat stores every learning — "short headlines work for gym leads," "storytelling outperforms statistics on Facebook" — in a `growth_insights` table that compounds over time across all brands in the portfolio. Every campaign makes future campaigns smarter.

**The Swarm runs all five layers in parallel, autonomously.** You set the objectives. The Swarm executes.

---

## Part 2 — How the Connectors Work Technically

### OAuth Architecture

Every social platform connection follows the same core pattern: **OAuth 2.0 with PKCE**, encrypted token storage in Cloudflare D1, and an hourly token refresh cycle via a dedicated Cloudflare Worker.

**Connection flow:**
1. User clicks "Connect" on a platform in the dashboard
2. The app generates a PKCE `code_verifier` + `code_challenge` and stores OAuth state in Cloudflare KV with a 10-minute TTL
3. User is redirected to the platform's OAuth authorization URL with requested scopes
4. Platform redirects back to `/api/social/callback/[platform]`
5. The callback handler exchanges the authorization code for an access token + refresh token
6. Both tokens are encrypted with AES-256-GCM using a workspace-specific `ENCRYPTION_KEY` before being written to the `connected_accounts` table in D1
7. The platform profile (account ID, username, avatar) is fetched and stored alongside the tokens

**Token storage (`connected_accounts` table):**
- `access_token_encrypted` — AES-256-GCM encrypted, never stored in plaintext
- `refresh_token_encrypted` — same encryption, nullable for platforms that don't issue refresh tokens
- `token_expires_at` — Unix seconds; used by the token refresher to identify expiring tokens
- `platform_account_id` — the platform's native ID for the connected account (critical for publishing)
- `account_status` — `active | expired | revoked | error`

### Platform-by-Platform Technical Details

**X (Twitter)**
Uses OAuth 2.0 with PKCE. Scopes: `tweet.read tweet.write users.read offline.access`. Access tokens expire in **2 hours** — the shortest expiry of any platform. Refresh tokens last 60 days. The token refresher runs every hour and proactively refreshes any token expiring within 24 hours. Publishing hits `POST /2/tweets`. The publisher adapter extracts the first tweet from AI-generated content (handles thread format, truncates at 280 chars with ellipsis). Two separate secrets are required: one on the Cloudflare Pages project (for the OAuth flow) and one on the Publisher Worker (for publishing). These must both be set with the same values.

**Facebook**
Uses Facebook Login OAuth 2.0. Scopes: `public_profile pages_show_list pages_manage_posts pages_read_engagement`. The key distinction: publishing requires a **Page access token**, not a user access token. During the OAuth connect, the handler calls `/me/accounts` to find the user's managed Pages and stores the **Page ID** (not the personal user ID) as `platform_account_id`. At publish time, the adapter fetches the Page's access token using the stored Page ID. For "New Pages Experience" pages that don't appear in `/me/accounts`, a direct fallback uses the stored `platform_account_id` to fetch the page token directly. Token refresh uses Facebook's `fb_exchange_token` mechanism to extend long-lived tokens (~60 days).

**Instagram**
Uses Instagram Business Login (the 2024+ API, not the legacy Facebook Login approach). Auth URL: `instagram.com/oauth/authorize`. Scopes are comma-separated: `instagram_business_basic, instagram_business_content_publish, instagram_business_manage_messages, instagram_business_manage_comments, instagram_business_manage_insights`. The token is an **Instagram token**, not a Facebook token — all API calls go to `graph.instagram.com`, not `graph.facebook.com`. The stored `platform_account_id` is the Instagram User ID from `graph.instagram.com/v21.0/me`. Publishing creates a media container at `/{igUserId}/media`, then publishes it at `/{igUserId}/media_publish`. **Requires an image URL** — Instagram does not support text-only posts via API.

**Threads**
Entirely separate from Instagram — different Meta app, different app ID, different API domain. Auth URL: `threads.net/oauth/authorize`. API domain: `graph.threads.net`. Scopes (comma-separated): `threads_basic, threads_content_publish, threads_manage_insights`. Publishing is a two-step process: create a container at `/{userId}/threads`, then publish at `/{userId}/threads_publish`. The Threads app must be in Live mode OR the connecting account must be listed as a Tester in the Meta developer portal (under the Threads app's Roles settings). Token refresh uses `th_refresh_token` grant.

**LinkedIn**
OAuth 2.0. Scopes: `openid profile w_member_social`. The `platform_account_id` stores the LinkedIn Person URN (e.g., `urn:li:person:abc123`). Publishing uses the UGC Posts API (`/v2/ugcPosts`) with `X-Restli-Protocol-Version: 2.0.0` header. The author field must be the full URN. LinkedIn tokens last 60 days and issue refresh tokens; the token refresher handles these automatically.

**Reddit**
OAuth 2.0 with Basic Auth (client_id:client_secret in Authorization header). Scopes: `identity submit read`. Publishing submits to a specific subreddit via `/api/submit`. Reddit's API is strictly rate-limited and requires a descriptive User-Agent (`GrowthOS/1.0`). For Reunion's tenant specifically, Reddit is configured as manual-approval-only — no automated posting. The primary use case is signal monitoring (trending topics, influencer discovery, community growth patterns) plus curated, human-reviewed posts.

**Pinterest**
OAuth 2.0. Scopes: `boards:read pins:read pins:write user_accounts:read`. Currently awaiting trial access approval on the App ID `1572207` before the secret is available. Publishing creates Pins via `/v5/pins`.

**YouTube**
OAuth 2.0 with Google. Scopes: `youtube.upload youtube.readonly yt-analytics.readonly`. Video upload requires a resumable multipart upload protocol that is not yet implemented. Publishing currently throws an informative error directing to YouTube Studio. Community posts via the Data API v3 are not supported by Google's API.

### The Publisher Worker

A dedicated Cloudflare Worker (`growthos-publisher`) runs on a **cron trigger every minute** to scan for posts due for publishing. It queries the `scheduled_posts` table for posts with `post_status IN ('queued', 'approved')` and a `scheduled_at` time in the past. For each due post, it builds a `PublishJobMessage` containing the post body, platform, connected account ID, workspace ID, and `platform_account_id` (injected into metadata as `_platformAccountId`). The message is enqueued into a Cloudflare Queue (`growthos-publish`). The Worker then consumes the queue in batches of 10, decrypts the stored access token, and dispatches to the correct platform adapter. On success it updates `post_status = 'published'` and stores the `platform_post_id` and `platform_post_url`. On failure it marks `post_status = 'failed'` with an error message and retries up to 3 times before moving to a dead-letter queue.

### The Token Refresher Worker

A separate Cloudflare Worker (`growthos-token-refresher`) runs on a **cron trigger every hour**. It queries `connected_accounts` for any account with `token_expires_at <= now + 24 hours`. For each expiring account it runs the appropriate refresh flow (OAuth 2.0 refresh token for X and LinkedIn, `fb_exchange_token` for Facebook, `ig_refresh_token` for Instagram, `th_refresh_token` for Threads). Refreshed tokens are re-encrypted and written back to D1. If a refresh fails, the account is marked `account_status = 'error'` so the UI can prompt the user to reconnect. This is what ensures tokens never silently expire mid-campaign the way they do on platforms like Predis.ai.

---

## Part 3 — The Content Creation Process

### How a Piece of Content Is Born

Content creation follows a layered prompt architecture that produces platform-native output by stacking four layers of context on top of each other:

**Layer 1 — Brand Identity**
Every prompt begins with the brand's identity pulled from the Brand Vault: brand name, mission statement, brand tone, and target audience. This grounds everything that follows. For Reunion, this means the AI always knows it's writing for a family challenge platform with a warm, community-first tone.

**Layer 2 — Doctrine Mode (Expert Persona)**
The user selects a strategic framework that dictates the writing philosophy. Options include:
- **GaryVee** — raw, high-volume, documentary-style, punchy hooks, authentic voice
- **MrBeast** — spectacle, cliffhangers, escalating stakes, irresistible titles, retention-first
- **Hormozi** — value stacking, logical frameworks, ROI-focused, Grand Slam Offer structure
- **Brunson** — Hook-Story-Offer, funnel-native, movement building, value ladder thinking
- **Seth Godin** — short-form essays, remarkable ideas, tribe building, no hype
- **Dan Kennedy** — direct response, bold claims, deadline-driven CTAs, no wasted words
- **Balanced** — platform-adaptive blend of all of the above

Each doctrine mode injects a detailed system prompt that shapes the AI's voice, plus a set of rules that constrain how it structures and delivers content.

**Layer 3 — Platform Constraints**
Every platform gets a detailed constraint block that defines character limits, demographic reality, native behaviors, and what actually works. The system knows that:
- Facebook's core audience is 35-65+, emotional storytelling outperforms short copy, questions and "tag someone who..." drive engagement
- Reddit's audience detects marketing instantly and punishes it — value-first, no self-promotion, no emojis, evidence-based
- TikTok's audience is 16-30, Gen Z-dominant, values rawness over polish, pattern interrupts every 3-5 seconds
- LinkedIn's audience is 28-55 professionals who reward personal stories connected to professional growth
- Pinterest's audience is women 25-45 who are planning-oriented — content should feel like a discovery, not a promotion

These constraints are not suggestions — they are injected directly into the system prompt so the AI generates platform-native content by default, not generic content that happens to be pasted into different platforms.

**Layer 4 — Content Type Instructions**
The final layer specifies the exact format: caption, thread, post, script, blog, carousel, hook, meme_copy, quote_card, landing_copy, email, newsletter, pin, story, or reel_script. Each format has precise structural instructions — a carousel gets "Slide 1 = hook that creates curiosity, Slides 2-9 = one clear idea per slide under 40 words, Slide 10 = CTA"; a thread gets "first tweet must stand alone as a hook, last tweet is CTA + retweet ask, each tweet provides standalone value."

### The Content Studio

In the dashboard, a user writes a brief (or accepts an AI-suggested topic from the Signals feed) and selects platforms, doctrine mode, and content type. The Content Studio calls the `generateContent` action, which builds the layered prompt and sends it to Claude via the Anthropic API (`claude-sonnet-4-20250514`). The response comes back as platform-specific drafts — one version per platform, each adapted to that platform's constraints. The user can regenerate individual platform versions, edit inline, attach media, and schedule directly from the studio into the Publisher queue.

### The Swarm's Content Agent

When the Swarm is running autonomously, the Content Agent generates content without human initiation. The Swarm orchestrator receives a task (e.g., "generate content for this week's Reunion challenge launch") and dispatches it to the ContentAgent. The agent reads the brief, identifies the target platforms, selects the appropriate doctrine mode based on the brand's Brand Vault configuration, and generates all platform variants in parallel. The output goes directly into the Publisher queue with a scheduled time, bypassing the manual studio entirely. The Swarm can run multiple content agents simultaneously across different topics and platforms.

---

## Part 4 — Image and Video Generation

### Images

Image generation is handled by **Replicate** using **Flux** models (Black Forest Labs). Two model tiers are available:
- **Flux Schnell** — fast generation (~2-5 seconds), used for high-volume content
- **Flux 1.1 Pro** — high quality (~10-30 seconds), used for ad creatives and hero images

The image prompt is constructed by combining the content brief with platform-specific visual style guidelines and aspect ratios:
- Instagram: vibrant, high-contrast, professional photography style → 4:5 aspect ratio
- Pinterest: aspirational, warm lighting, lifestyle aesthetic → 3:4
- Facebook: friendly, warm, community-focused → 16:9
- YouTube: bold, dramatic, thumbnail-optimized → 16:9
- TikTok: trendy, dynamic, mobile-optimized → 9:16
- LinkedIn: professional, clean, corporate but modern → 16:9

Job type also modifies the style: memes get bold solid backgrounds with text overlay space, quote cards get minimal elegant gradients, thumbnails get dramatic dramatic compositions, ad creatives get high production value framing.

The generation flow: create prediction on Replicate → poll every 1.5 seconds until `succeeded` → download image as ArrayBuffer → upload to Cloudflare R2 for permanent storage → return a `computer://` URL that feeds into the post's `image_url` field. Multiple images (for carousels) are generated in parallel as concurrent Replicate predictions.

All image prompts explicitly append "no text, no words, no letters, no watermarks" — text is overlaid separately by the front-end or the carousel generator, not burned into the image by the AI. This preserves design flexibility.

### Video

Video production is a **three-stage pipeline**: script generation → voiceover → video composition.

**Stage 1 — Script (Claude)**
The AI generates a video script using the reel_script or script content type with platform-appropriate constraints. For TikTok: hook in first 2 seconds, pattern interrupt every 3-5 seconds, engagement hook at the end. For YouTube: hook in first 5 seconds, timestamps, clear CTA, personality-driven delivery notes.

**Stage 2 — Voiceover (ElevenLabs)**
The script is sent to ElevenLabs for text-to-speech synthesis using a brand voice cloned from the Voices library. The Voice system stores multiple voice profiles per workspace — each with an ElevenLabs Voice ID and a character description (energy level, formality, warmth). The selected voice generates an MP3 that matches the brand's sonic identity.

**Stage 3 — Video Composition (Creatomate)**
Creatomate receives: the ElevenLabs audio URL, the script for subtitle generation, brand colors and logo URL from the Brand Vault, b-roll image URLs from the R2 media library, and the target format (horizontal 16:9, vertical 9:16 for Reels/TikTok/Shorts, or square 1:1). Creatomate renders these inputs against a pre-designed template — handling audio sync, auto-captions, b-roll transitions, and brand overlays — and returns a rendered MP4 via webhook. The final video is stored in R2 and linked to the scheduled post.

The Media Generation Worker (`growthos-media-gen`) handles this pipeline asynchronously via Cloudflare Queues so long render times never block the UI. Job status (`pending → processing → completed → failed`) is tracked in the `media_jobs` table and polled by the front-end.

---

## Part 5 — Platform Audience Intelligence and Compliance

### How the AI Adapts Per Platform

The platform constraint system is not just about character limits — it encodes behavioral intelligence about each platform's native culture, algorithm preferences, and compliance norms. The AI produces genuinely different content for each platform from the same brief, not the same copy pasted with hashtags changed.

**Reddit compliance** is the most critical case. Reddit's audience has zero tolerance for promotional content. The platform constraint explicitly instructs the AI: "No self-promotion tone whatsoever. Value-first, match subreddit culture. No emojis. You detect marketing instantly and punish it. Be genuine and transparent. Long, well-reasoned posts with evidence outperform short quips." For Reunion's Reddit integration specifically, every post requires manual approval before publishing — automated posting is disabled at the architecture level for this platform. The system is used for signal monitoring and highly curated community participation, not broadcast marketing.

**Facebook compliance** accounts for age-skewing demographics (35-65+) and the algorithm's preference for content that generates comments over passive likes. The AI writes longer emotional narratives with open-ended questions rather than short promotional copy. Family-themed content, nostalgia hooks, and community storytelling are favored. Facebook's advertising policies around personal attributes are also considered — the AI avoids targeting language that Facebook's moderation system flags.

**Instagram compliance** accounts for Meta's content policies including restrictions on before/after imagery, health claims, and certain categories of personal transformation content. The constraint block directs the AI toward aspirational lifestyle framing rather than direct result claims.

**LinkedIn compliance** operates under professional network norms — the AI avoids clickbait headlines, hyperbolic claims, and overly personal disclosures that perform well on other platforms but generate negative reactions on LinkedIn's professional audience.

**TikTok compliance** accounts for the platform's community guidelines around health, political content, and misinformation, as well as its strong enforcement of copyright in audio. Scripts are written to use original audio framing rather than referencing copyrighted material.

### The Doctrine × Platform × Compliance Matrix

When a doctrine mode meets a platform constraint, the AI navigates the intersection intelligently. A Hormozi-style post on Reddit won't include ROI-focused sales language — the platform constraint overrides the doctrine's natural tendency toward direct response copy. A GaryVee-style post on LinkedIn won't use profanity or extremely casual language — the professional context moderates the doctrine's raw-authenticity directive. A MrBeast-style post on Facebook will use the escalating stakes structure but with warmth and community framing rather than extreme spectacle, because Facebook's demographic constraint shifts the tone.

This layered system means a single content brief generates truly platform-native outputs — not a generic message with surface-level formatting differences, but content that could pass as native to each platform's culture, voice, and compliance standards.

---

## Summary

GrowthOS is built on a single architectural philosophy: **every action should compound**. Signals feed Content, Content feeds Publishing, Publishing feeds Engagement, Engagement feeds Signals. Influencer discoveries get scored and stored. Campaign performance gets stored in the Insight Moat. The GOE's winning variants become the default templates. Every cycle makes the next cycle cheaper, faster, and more effective. The Swarm executes autonomously. The human sets the objectives, reviews the output, and scales the winners. That is the autopilot marketing ecosystem.
