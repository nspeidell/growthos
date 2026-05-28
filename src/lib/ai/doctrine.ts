import type { BrandProfile } from "@/lib/db/schema";
import type { Platform, ContentType, DoctrineMode } from "@/types/api";

// ═══════════════════════════════════════════
// Doctrine Mode Definitions
// ═══════════════════════════════════════════

export interface DoctrineConfig {
  key: DoctrineMode;
  displayName: string;
  description: string;
  systemPrompt: string;
  rules: string[];
}

export const DOCTRINE_MODES: Record<DoctrineMode, DoctrineConfig> = {
  garyvee: {
    key: "garyvee",
    displayName: "GaryVee",
    description: "Volume + authenticity. Document, don't create.",
    systemPrompt:
      "You create content in the style of Gary Vaynerchuk. Be raw, authentic, and relentless. " +
      "Focus on documenting real experiences rather than creating polished content. " +
      "Use punchy, short sentences. Be direct and motivational. Emphasize hustle, patience, and self-awareness. " +
      "Repurpose one idea across multiple formats. Every piece should feel like it came from a real conversation.",
    rules: [
      "High frequency — quantity leads to quality",
      "Document, don't create — share real moments",
      "Short punchy hooks — grab in the first line",
      "Multi-platform repurposing — one idea, many formats",
      "Authentic voice — no corporate speak",
      "End with a question or call to engage",
    ],
  },
  mrbeast: {
    key: "mrbeast",
    displayName: "MrBeast",
    description: "Spectacle + retention. Every second must earn the next.",
    systemPrompt:
      "You create content in the style of MrBeast. Focus on extreme engagement and retention. " +
      "Every sentence should make the reader want to read the next one. Use cliffhangers, pattern interrupts, " +
      "and escalating stakes. Titles must be irresistible. Focus on spectacle, generosity, and wow moments. " +
      "A/B test everything mentally — always ask 'would I click this?'",
    rules: [
      "Irresistible titles — would you click this?",
      "Cliffhangers and pattern interrupts",
      "Escalating stakes throughout the content",
      "Every second earns the next second",
      "Test multiple thumbnail/title combos",
      "Spectacle over subtlety",
    ],
  },
  hormozi: {
    key: "hormozi",
    displayName: "Hormozi",
    description: "Value stacking + logical persuasion.",
    systemPrompt:
      "You create content in the style of Alex Hormozi. Be logical, structured, and value-dense. " +
      "Use frameworks, contrarian takes, and ROI-focused copy. Stack value relentlessly. " +
      "Present ideas as equations and systems. Be direct about money and results. " +
      "Use the Grand Slam Offer structure: dream outcome + perceived likelihood + time delay + effort/sacrifice.",
    rules: [
      "Lead with value — give away the secrets",
      "Use frameworks and numbered systems",
      "Contrarian takes that challenge conventional wisdom",
      "ROI-focused — always connect to outcomes",
      "Grand Slam Offer structure",
      "No fluff — every sentence must carry weight",
    ],
  },
  brunson: {
    key: "brunson",
    displayName: "Brunson",
    description: "Funnels + storytelling + irresistible offers.",
    systemPrompt:
      "You create content in the style of Russell Brunson. Lead with storytelling and the Attractive Character framework. " +
      "Build value ladders. Create urgency and scarcity. Use the Hook-Story-Offer structure for every piece. " +
      "Reference DotCom Secrets and Expert Secrets principles. Make the reader feel like they're part of a movement.",
    rules: [
      "Hook-Story-Offer structure for every piece",
      "Attractive Character framework — be relatable",
      "Value ladders — start free, build to premium",
      "Urgency and scarcity — deadlines drive action",
      "Movement building — us vs. them mentality",
      "Epiphany Bridge stories — share the moment of realization",
    ],
  },
  sethgodin: {
    key: "sethgodin",
    displayName: "Seth Godin",
    description: "Permission marketing + remarkable ideas.",
    systemPrompt:
      "You create content in the style of Seth Godin. Write short, thought-provoking pieces that challenge assumptions. " +
      "Focus on permission marketing, being remarkable (Purple Cow), and building tribes. " +
      "Use metaphors and analogies. Be philosophical but practical. Every piece should make the reader think differently. " +
      "Avoid hype — earn attention through ideas, not volume.",
    rules: [
      "Short-form essays — say more with less",
      "Thought leadership — challenge assumptions",
      "Purple Cow moments — what makes this remarkable?",
      "Tribe building — who is this for?",
      "Permission, not interruption",
      "Metaphors and analogies over data dumps",
    ],
  },
  dankennedy: {
    key: "dankennedy",
    displayName: "Dan Kennedy",
    description: "Direct response + no-BS salesmanship.",
    systemPrompt:
      "You create content in the style of Dan Kennedy. Be bold, direct, and unapologetic about selling. " +
      "Use long-form copy when it serves the sale. Include deadlines, bold claims backed by proof, and strong personality. " +
      "Focus on direct response principles: measurable results, clear CTAs, and no wasted words. " +
      "Write as if every word costs money — because in direct response, it does.",
    rules: [
      "Direct response — every piece must drive action",
      "Bold claims backed by proof and testimonials",
      "Deadline-driven CTAs — urgency is mandatory",
      "Strong personality — be polarizing, not bland",
      "Long-form when the sale demands it",
      "Measurable — track everything",
    ],
  },
  balanced: {
    key: "balanced",
    displayName: "Balanced",
    description: "Blended best practices from all modes.",
    systemPrompt:
      "You create content using a balanced approach that draws from multiple marketing philosophies. " +
      "Adapt your style to the platform and content type. Use data-informed decisions about tone, length, and format. " +
      "Be authentic but strategic. Focus on value delivery and audience connection. " +
      "Match the energy of each platform's native content style.",
    rules: [
      "Platform-appropriate tone and format",
      "Value-first — give before asking",
      "Data-informed content decisions",
      "Authentic but strategic voice",
      "Adapt style to the audience and context",
      "Balance engagement with conversion",
    ],
  },
};

// ═══════════════════════════════════════════
// Reunion Content Pillars
// ═══════════════════════════════════════════

export const REUNION_CONTENT_PILLARS = {
  memory_legacy: {
    name: "Memory & Legacy",
    purpose: "Emotional depth",
    topics: "preserving stories, grandparents, family traditions, forgotten memories, oral history, emotional nostalgia",
    formats: "emotional reels, story carousels, short documentaries, founder monologues, quotes",
  },
  fragmentation: {
    name: "Modern Family Fragmentation",
    purpose: "Problem awareness — make the audience feel the problem before presenting the solution",
    topics: "disconnected families, digital isolation, social media fatigue, lack of meaningful conversation, scattered memories",
    formats: "commentary, stats, relatable humor, short educational clips",
  },
  participation: {
    name: "Participation Content",
    purpose: "Engagement loops — get families to interact with each other through the content",
    topics: "polls, trivia, 'ask your parents this', 'who remembers this?', family personality archetypes",
    formats: "polls, quizzes, comment bait, interactive reels, image posts",
  },
  humor: {
    name: "Humor & Relatability",
    purpose: "Shares and virality — content people forward to their family group chat",
    topics: "family group chat memes, generational humor, sibling jokes, family archetypes",
    formats: "memes, skits, reaction content, stitched trends",
  },
  movement: {
    name: "Human Connection Movement",
    purpose: "Brand identity — position Reunion as a movement, not just an app",
    topics: "loneliness epidemic, importance of belonging, preserving human connection, family values, shared identity",
    formats: "founder-led thought leadership, podcasts, long-form writing, cinematic video",
  },
} as const;

export type ReunionPillar = keyof typeof REUNION_CONTENT_PILLARS;

// ═══════════════════════════════════════════
// Platform Constraints
// ═══════════════════════════════════════════

const PLATFORM_CONSTRAINTS: Record<string, string> = {
  instagram:
    "Platform: Instagram. Max 2200 chars caption. Use line breaks for readability. Up to 30 hashtags (put them at the end, separated from main text). Put CTA in first 125 chars (before 'more' fold). " +
    "DEMOGRAPHIC: Core audience 25–45 (primary), 18–24 (secondary). Visually emotional, nostalgic, premium-aesthetic audience. They value authenticity, behind-the-scenes realness, and content that makes them feel something. " +
    "CONTENT STRATEGY: Hook must land within 1.5 seconds. Reels 7–35 seconds ideal. Carousels drive saves — structure them as 'swipe for more' value sequences. Stories for daily presence and polls. " +
    "TOP METRICS: Shares and saves are the most important signals. Optimize every caption and visual for 'would someone save this?' and 'would someone send this to a family member?' " +
    "COMPLIANCE — AVOID: Repetitive hashtags, engagement bait spam, copied content with watermarks, mass follow/unfollow, automation abuse, posting identical captions repeatedly. These trigger shadowbans. " +
    "TONE: Warm, nostalgic, emotionally intelligent. No corporate speak. No AI/OS/platform language. No feature overload messaging.",

  facebook:
    "Platform: Facebook. Optimal 40–80 chars for peak engagement, but longer emotional storytelling performs very well. Links in text body. " +
    "DEMOGRAPHIC: Core audience 35–65+. The most important platform for Reunion's primary demographic. Parents, grandparents, and community-minded adults dominate. They read full posts. They share emotional stories. They join groups. " +
    "CONTENT STRATEGY: Two-channel approach — (1) Brand Page for authority, ads, announcements; (2) 'The Family Connection Project' group for community movement. Group content drives Facebook reach. Long-form emotional narratives perform best. Discussion prompts and 'tag someone who...' drive engagement. Questions generate comments. " +
    "TOP METRICS: Shares, comments, active group members, returning commenters, video retention. " +
    "COMPLIANCE — AVOID: Political bait, misinformation, spam links, excessive outbound links, sensationalism, fake urgency. Native content always outperforms link posts. " +
    "TONE: Warm, community-oriented. Longer captions are appropriate here. This audience reads. Nostalgic and emotionally resonant content wins.",

  tiktok:
    "Platform: TikTok. Script for 15–60 second video. Hook in first 1–2 seconds is everything. " +
    "DEMOGRAPHIC: Core audience 18–40, strongest emotional engagement 24–38. They value creativity, rawness, humor, and authenticity over production quality. " +
    "CONTENT STRATEGY: Reunion's TikTok should NOT feel corporate. Emotional storytelling, quick family insights, nostalgia, humor, POV content, 'things I realized about my family', intergenerational psychology. Fast pacing but emotionally grounded. Use captions, movement every 2–3 seconds, emotional hooks, storytelling arcs. Respond to comments with video replies. Stitch emotional stories. Use trends selectively — prioritize authenticity. " +
    "TOP METRICS: Completion rate (the most important signal on TikTok), average watch time, rewatches, shares, comment velocity. " +
    "COMPLIANCE — AVOID: Recycled low-quality content, political extremity, manipulative fear tactics, overusing hashtags, engagement bait spam. TikTok low-fi beats high-fi — over-production actually hurts performance. " +
    "TONE: Authentic, raw, emotionally real. Trending audio where relevant. TikTok-native language (POV:, storytime, no because...). Short punchy captions.",

  x:
    "Platform: X (Twitter). Max 280 chars per tweet. Thread format: hook tweet → value tweets → CTA tweet. Minimal hashtags (1–2 max). " +
    "DEMOGRAPHIC: Core audience 25–50. News-obsessed, opinion-driven, quick-scrolling. Tech founders, media, writers. They value brevity, clever framing, intellectual provocation, and hot takes. " +
    "CONTENT STRATEGY: Thought leadership and cultural positioning for Reunion. Emotional one-liners, social commentary, founder reflections, thread essays, statistics, cultural observations. The reply strategy matters MORE than posting — daily: reply to large creators, join trending conversations, quote tweet thoughtfully, build relationships. Provocative but thoughtful takes spread fastest. " +
    "TOP METRICS: Impressions, bookmarks, profile clicks, engagement rate, follower growth velocity. Bookmarks = high-value signal. " +
    "COMPLIANCE — AVOID: Rage bait, excessive automation, repetitive posting, copy/paste replies. " +
    "TONE: Direct, punchy, intellectually grounded. Threads should escalate in value. Quote-tweetable lines win.",

  threads:
    "Platform: Threads (Meta). Max 500 chars per post. Tone: casual, conversational, warm. Less confrontational than X, more community-oriented. " +
    "DEMOGRAPHIC: Core audience 25–45. Instagram crossover users and early adopters. " +
    "CONTENT STRATEGY: Use Threads as the conversational intimacy channel and founder personality channel. Softer reflections, behind-the-scenes thoughts, emotional observations, relatable questions. This is where Reunion's warm human voice lives. Early audience nurturing happens here. Authenticity and conversation drive engagement — no hashtag culture yet. " +
    "TOP METRICS: Replies, shares, follower growth. Relatability and conversation starters are the primary engagement mechanisms. " +
    "TONE: Warm, reflective, personal. Like texting a thoughtful friend. More positive vibes than X.",

  reddit:
    "Platform: Reddit. CRITICAL: No self-promotion tone whatsoever. Value-first, match subreddit culture. No emojis. Conversational, not salesy. " +
    "DEMOGRAPHIC: Core audience 20–45. High skepticism, detail-oriented, expertise-valuing. They detect marketing instantly and punish it with downvotes and bans. " +
    "CONTENT STRATEGY FOR REUNION: DO NOT MARKET LIKE A BRAND. Reddit's value is community intelligence and authority building — not direct promotion. Participate genuinely in: r/family, r/parenting, r/genealogy, r/nostalgia, r/AgingParents, r/relationships, r/loneliness. Become useful. Share real insights, founder observations, helpful advice, emotional discussion prompts. Build karma slowly. A single genuine comment in the right thread is worth more than a hundred posts. " +
    "COMPLIANCE — NEVER: Spam, self-promotion, link dumping, low-effort marketing, mentioning the app unprompted. Reddit bans liberally. " +
    "TONE: Genuine, transparent, like a community member not a brand. Long, well-reasoned posts with evidence outperform short quips.",

  linkedin:
    "Platform: LinkedIn. Professional but personable. Hook in first 2 lines (before 'see more' fold). Use line breaks generously. 1300–2000 chars optimal. No hashtag spam (3–5 max at end). " +
    "DEMOGRAPHIC: Core audience 28–55. Professionals, decision-makers, career-focused individuals. They value thought leadership, professional storytelling, frameworks, and career/business insights. " +
    "CONTENT STRATEGY: Founder authority and business credibility for Reunion. Best angles: loneliness epidemic, modern connection problems, future of trusted communities, family/work balance, emotional technology, the startup journey. Personal stories that connect to professional themes perform best. 'Here's what I learned from failing' outperforms 'Here's my success story.' NOT the place for family memes. " +
    "TOP METRICS: Profile views, inbound connections, post engagement, founder authority growth. " +
    "TONE: Professional but deeply human. Founder-voice essays and frameworks. Carousels for step-by-step insights.",

  pinterest:
    "Platform: Pinterest. CRITICAL: Pinterest is NOT a social platform. It is a VISUAL DISCOVERY ENGINE + EMOTIONAL SEARCH ENGINE. People use it to imagine a better life, save ideas, feel inspired, and plan their future. Treat it like visual Google. " +
    "Title max 100 chars — keyword-rich, emotionally resonant. Description 200–500 chars with natural keyword placement. NEVER write descriptions that feel like ads or marketing copy. " +
    "WHAT WE ARE SELLING: warmth, belonging, traditions, memories, togetherness, legacy, family presence. NOT the app, NOT features, NOT technology. " +
    "DEMOGRAPHIC: Core audience women 25–54 (moms, grandmothers, family planners). Secondary: parents 28–45, grandparents 55–75. Also: homeschool communities, church families, military families, blended families. " +
    "THE 12 REUNION BOARDS AND WHAT TO PIN TO EACH: " +
    "(1) 'Family Traditions Worth Keeping' — holiday traditions, weekly rituals, family night ideas, birthday traditions, generational activities. Keywords: family traditions, family ritual ideas, meaningful traditions. " +
    "(2) 'Questions to Ask Your Grandparents' — conversation prompts, legacy questions, memory preservation, storytelling prompts. THIS IS THE HIGHEST-POTENTIAL BOARD. Keywords: questions for grandparents, family history questions, preserving family stories, conversation starters. " +
    "(3) 'The Digital Family Living Room' — warm aesthetic imagery, cozy family spaces, cinematic family moments. Brand identity and emotional visual world. " +
    "(4) 'Family Connection Ideas' — activities, games, discussion prompts, family challenges. Keywords: family bonding activities, family connection ideas. " +
    "(5) 'Family Group Chat Humor' — relatable memes, funny family texts, generational humor, 'mom texts'. Use for personality and younger audience reach. " +
    "(6) 'Memory Keeping Without Feeling Cringe' — authentic memory preservation, candid photos, real moments, storytelling. Modernize memory culture. Keywords: memory preservation, family storytelling. " +
    "(7) 'Family Dinner & Gathering Inspiration' — family tables, recipes, gatherings, hospitality, connection rituals. Massive overlap with moms and grandparents. " +
    "(8) 'Raising Connected Kids' — family bonding, tech balance, traditions, emotional intelligence. Keywords: intentional parenting, family connection, raising connected children. " +
    "(9) 'Family Legacy Ideas' — memory books, legacy letters, family values, ancestry. Positioning: 'Be the founder of your family legacy.' Keywords: family legacy, family history, preserving family stories. " +
    "(10) 'Cozy Family Life' — warmth, togetherness, cozy home moments, soft nostalgic imagery. Defines Reunion's visual emotional world. " +
    "(11) 'Family Reunion Ideas' — games, shirts, activities, planning. MASSIVE search volume. Pull organic discovery traffic. " +
    "(12) 'AI for Families' — helping families stay connected, memory resurfacing. NEVER position AI as surveillance or analytics. Keep it invisible, assistive, connective. " +
    "PIN FORMATS THAT PERFORM BEST: " +
    "(1) TEXT-OVER-IMAGE EMOTIONAL PINS (highest saves): 'One day the loud family dinners become memories.' / 'The stories disappear when nobody shares them.' / 'The blurry photos become your favorites later.' " +
    "(2) CAROUSEL/STEP PINS: '10 Questions To Ask Your Grandparents' / '5 Family Traditions Worth Starting' / 'How To Keep Long-Distance Families Close' " +
    "(3) CINEMATIC LIFESTYLE IMAGERY: warm kitchens, couches, old photos, gatherings, grandparents, family tables " +
    "(4) HUMOR PINS: family text memes, generational jokes, family chaos observations " +
    "PRIMARY SEO KEYWORDS: family connection, family traditions, family memories, family bonding, questions for grandparents, preserving memories, intentional family life, family gathering ideas. " +
    "LONG-TAIL KEYWORDS (gold): 'how to stay connected as a family', 'meaningful family traditions', 'ways to connect with grandparents', 'family bonding activities', 'preserving family stories', 'family legacy ideas', 'reconnecting with family'. " +
    "POSTING STRATEGY: 3–8 pins daily, mostly evergreen, heavy scheduling. Pinterest rewards CONSISTENCY and keyword richness — NOT viral spikes. " +
    "CRITICAL RULE: Do not over-brand. No startup energy. No app screenshots. No software graphics. Content must feel editorial, emotional, save-worthy, and lifestyle-oriented. " +
    "TOP METRICS: Saves (most important), monthly viewers, click-through rate to website. " +
    "TONE: Aspirational, warm, practical. Emotionally resonant. Save-worthy framing. Discovery-oriented ('10 ways to...', 'The ultimate guide to...'). Never salesy.",

  youtube:
    "Platform: YouTube. Title max 100 chars — must create curiosity gap. Description needs timestamps, links, keywords in first 2 lines. Hook viewers in first 5 seconds of script. " +
    "DEMOGRAPHIC: Core audience 18–35 for Shorts, broader 25–55 for long-form family content. This is the world's second-largest search engine — depth and educational value matter. " +
    "CONTENT STRATEGY: Tutorial and how-to content dominates. Think 'show me how' and 'take me through the process' energy. Audience expects personality, energy, and real value. Pattern interrupts every 30–60 seconds. End with clear CTA (subscribe, comment, next video). Shorts (under 60s) skew younger (13–25) and behave like TikTok. " +
    "TONE: Energetic but grounded. Educational and emotionally resonant. Strong narrative arc for long-form.",

  website:
    "Platform: Website/Blog. SEO-optimized with H2 subheadings. Meta title (60 chars) and meta description (155 chars). Internal linking opportunities. Tone: authoritative, helpful, thorough. Write for featured snippets. Answer the search intent directly, then expand. Use short paragraphs, bullet points for scannability. " +
    "AEO REQUIREMENT: Structure all content to be indexed by AI answer engines (Perplexity, ChatGPT, Google AI Overviews, Claude, Gemini). Use concise summary paragraphs, FAQ sections, structured headings, and conversational phrasing that answers specific questions directly. " +
    "SEO CLUSTERS FOR REUNION: family connection ideas, how to reconnect with family, questions to ask grandparents, preserving family stories, family bonding activities, feeling disconnected from family, family reunion ideas, family traditions ideas. " +
    "DEMOGRAPHIC: Search-intent visitors across all ages — write for the problem they're solving, not a demographic persona.",

  email:
    "Platform: Email newsletter. Subject line (40–60 chars). Preview text (90 chars). Single clear CTA. Scannable with short paragraphs. Tone: personal, direct, like writing to one person. " +
    "DEMOGRAPHIC: Opted-in subscribers who already trust the brand — reward that trust with exclusive value. Skews 25–55, higher intent than social. " +
    "EMAIL SEQUENCE TYPES FOR REUNION: (1) Emotional onboarding, (2) Family reflection prompts, (3) Memory prompts, (4) Founder letters, (5) Community stories, (6) Feature education. " +
    "TONE: First-person voice. P.S. lines drive clicks. Personal, warm, and reflective. This is the highest-conversion channel.",

  google_business:
    "Platform: Google Business Profile. Post max 1500 chars but keep to 150–300 for readability. Tone: local, helpful, trustworthy. " +
    "DEMOGRAPHIC: Local customers actively searching — high purchase intent, all ages. " +
    "Include relevant keywords naturally. Always include a CTA (call, visit, book). Updates, offers, and events perform best. Professional but approachable.",

  wordpress:
    "Platform: WordPress Blog. Long-form SEO content. 1500–3000 words optimal for ranking. H2/H3 structure, meta description, featured image alt text. Tone: authoritative, educational, thorough. Internal and external linking. Write for both search engines and humans. Include a table of contents for posts over 2000 words. " +
    "AEO: Structure content to be cited by AI answer engines. Use FAQ sections, direct answer paragraphs, statistics, and expert framing. " +
    "DEMOGRAPHIC: Search-driven readers across all ages, often comparing options or learning how to do something.",

  medium:
    "Platform: Medium. 5–8 minute read optimal (1500–2500 words). Tone: thoughtful, personal essay style, intellectual but accessible. " +
    "DEMOGRAPHIC: Core audience 25–45, curious readers, professionals, writers, and tech-savvy intellectuals. Strong opening paragraph is critical — it appears in previews. Use subheadings every 3–4 paragraphs. Personal anecdotes + data = winning formula. End with a takeaway, not a sales pitch. " +
    "BEST REUNION ANGLES: loneliness epidemic, family connection, digital culture, nostalgia economy, modern parenting, the importance of belonging.",

  ghost:
    "Platform: Ghost Blog. Similar to WordPress but audience expects premium, newsletter-style content. Tone: polished, expert, membership-worthy. Content should feel exclusive. 1000–2500 words. Strong email-friendly formatting since Ghost posts often go to subscriber inboxes. " +
    "DEMOGRAPHIC: 25–50, premium content consumers. Indie web enthusiasts. Willing to pay for quality. " +
    "USE FOR REUNION: Long-form publishing hub, premium content system, future membership ecosystem. Founder essays, emotional newsletters, deep research, movement-building content.",

  substack:
    "Platform: Substack Newsletter. Tone: personal, voice-driven, intimate. " +
    "DEMOGRAPHIC: Core audience 25–55, intellectually curious, willing to pay for voice-driven perspectives. Write like a smart friend sharing insights over coffee. 800–2000 words. " +
    "USE FOR REUNION: Emotional founder newsletter. Build emotional loyalty, recurring readers, movement identity. Warm. Reflective. Human. NOT corporate. Conversational first-person. Include discussion prompts for comments. Each post should feel like a letter, not an article.",
};

// ═══════════════════════════════════════════
// Content Type Instructions
// ═══════════════════════════════════════════

const CONTENT_TYPE_INSTRUCTIONS: Record<string, string> = {
  caption: "Write a social media caption. Include suggested hashtags separately at the end. Make the first line a hook that stops the scroll.",
  thread: "Write a thread of 5–10 tweets. Number each tweet. First tweet is the hook — it must stand alone and make people want to read more. Last tweet is the CTA + a retweet ask. Each tweet should provide standalone value.",
  post: "Write a post with a compelling title and body text. Match the community's tone and norms. Lead with value, not promotion.",
  script: "Write a video script with timestamps. Include: [HOOK 0:00–0:05], [INTRO 0:05–0:15], [MAIN CONTENT with pattern interrupts], [CTA], [OUTRO]. Write exactly what to say, not stage directions.",
  blog: "Write a blog post with: title, meta description (155 chars), introduction that hooks and previews value, H2 sections with actionable content, conclusion with key takeaways, and CTA. Structure for AEO: include a direct-answer summary paragraph and FAQ section so AI answer engines can cite it.",
  carousel: "Write copy for a 10-slide carousel. Slide 1 = hook/title that creates curiosity. Slides 2–9 = one clear idea per slide, under 40 words each. Slide 10 = CTA + follow prompt. Number each slide clearly. Design for saves — this should be content people want to return to.",
  hook: "Generate 10 attention-grabbing opening lines. Each should create curiosity or urgency. Vary the formats: question, surprising stat, story opener, bold claim, 'most people' contrarian, 'stop doing X', how-to promise, myth-busting, personal confession, future prediction.",
  meme_copy: "Generate 5 meme text pairs. Format: TOP TEXT / BOTTOM TEXT. Keep it funny, relatable, and shareable. Reference common family experiences your audience has. The goal is to make someone send this to their family group chat immediately.",
  quote_card: "Write 5 shareable quotes. Each should be inspiring, emotionally resonant, or thought-provoking. Format as standalone quotes. Make them screenshot-worthy. Should feel like something a grandmother or parent would save and share.",
  landing_copy: "Write landing page copy with: headline (benefit-driven, max 10 words), subheadline (expand on the promise), 3 benefit bullets with brief explanations, social proof section placeholder, objection handler, and primary CTA button text + supporting text.",
  email: "Write an email with: subject line (40–60 chars, curiosity-driven), preview text (90 chars), greeting, body (3–4 short paragraphs building to the CTA), CTA button text, P.S. line with secondary hook, and sign-off.",
  newsletter: "Write a newsletter edition with: catchy subject line, preview text, personal opening, 2–3 content sections with headers, key insight or takeaway, and CTA. Tone should feel like a personal update, not a broadcast. Warm, reflective, human.",
  pin: "Write a Pinterest pin: keyword-rich title (max 100 chars), description (200–500 chars) with natural keywords, and suggested board name. Focus on searchability and save-worthiness. Use family connection keywords naturally.",
  story: "Write 3–5 Instagram/Facebook Story frames. Each frame: visual description + overlay text (max 20 words) + any sticker/poll/question suggestions. Build a narrative arc across frames. Last frame = CTA.",
  reel_script: "Write a short-form video script (15–60 seconds). HOOK (first 1.5 seconds — text on screen + what to say). BODY (main content with visual cues every 2–3 seconds). CLOSER (CTA or loop back to hook). Include trending audio suggestion if relevant. The hook must make someone freeze mid-scroll.",
};

// ═══════════════════════════════════════════
// Prompt Builder
// ═══════════════════════════════════════════

export interface PromptContext {
  mode: DoctrineMode;
  brand: Pick<BrandProfile, "brandName" | "mission" | "tone" | "audience">;
  platform: Platform;
  contentType: ContentType;
  contentPillar?: ReunionPillar;
  additionalContext?: string;
}

/**
 * Build a complete system prompt by layering:
 * 1. Brand identity
 * 2. Doctrine rules
 * 3. Platform constraints (with compliance, audience, and Reunion-specific strategy)
 * 4. Content pillar context (optional — Reunion's 5 pillars)
 * 5. Content type instructions
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const doctrine = DOCTRINE_MODES[ctx.mode];
  const pillar = ctx.contentPillar ? REUNION_CONTENT_PILLARS[ctx.contentPillar] : null;

  const layers = [
    // Layer 1: Brand identity
    `You are creating content for "${ctx.brand.brandName}".`,
    `Brand mission: ${ctx.brand.mission}`,
    `Brand tone: ${ctx.brand.tone}`,
    `Target audience: ${ctx.brand.audience}`,

    // Layer 2: Doctrine
    "",
    `Strategy mode: ${doctrine.displayName}`,
    doctrine.systemPrompt,
    `Key rules:\n${doctrine.rules.map((r) => `- ${r}`).join("\n")}`,

    // Layer 3: Platform constraints (audience + compliance + strategy)
    "",
    PLATFORM_CONSTRAINTS[ctx.platform] ?? "",

    // Layer 4: Content pillar (optional)
    ...(pillar
      ? [
          "",
          `Content Pillar: ${pillar.name}`,
          `Pillar purpose: ${pillar.purpose}`,
          `Topics to draw from: ${pillar.topics}`,
          `Best formats for this pillar: ${pillar.formats}`,
        ]
      : []),

    // Layer 5: Content type instructions
    "",
    CONTENT_TYPE_INSTRUCTIONS[ctx.contentType] ?? "",
  ];

  if (ctx.additionalContext) {
    layers.push("", `Additional context: ${ctx.additionalContext}`);
  }

  return layers.filter(Boolean).join("\n");
}

/**
 * Get the recommended content pillar for a given platform and intent.
 * Used by the Swarm to auto-assign pillars when not manually specified.
 */
export function getRecommendedPillar(platform: Platform, intent?: string): ReunionPillar {
  const lowerIntent = (intent ?? "").toLowerCase();

  // Intent-based pillar matching
  if (lowerIntent.includes("meme") || lowerIntent.includes("humor") || lowerIntent.includes("funny")) {
    return "humor";
  }
  if (lowerIntent.includes("poll") || lowerIntent.includes("trivia") || lowerIntent.includes("quiz") || lowerIntent.includes("participat")) {
    return "participation";
  }
  if (lowerIntent.includes("memoir") || lowerIntent.includes("grandp") || lowerIntent.includes("memory") || lowerIntent.includes("legacy") || lowerIntent.includes("story")) {
    return "memory_legacy";
  }
  if (lowerIntent.includes("loneliness") || lowerIntent.includes("movement") || lowerIntent.includes("mission") || lowerIntent.includes("thought leadership")) {
    return "movement";
  }
  if (lowerIntent.includes("disconnect") || lowerIntent.includes("problem") || lowerIntent.includes("fragm") || lowerIntent.includes("isolation")) {
    return "fragmentation";
  }

  // Platform defaults
  const platformDefaults: Partial<Record<Platform, ReunionPillar>> = {
    instagram: "memory_legacy",
    facebook: "memory_legacy",
    tiktok: "humor",
    x: "movement",
    threads: "fragmentation",
    reddit: "movement",
    linkedin: "movement",
    pinterest: "participation",
    youtube: "memory_legacy",
  };

  return platformDefaults[platform] ?? "memory_legacy";
}
