/**
 * Growth Optimization Engine — Module Integrations
 *
 * Provides experiment-aware hooks for all GrowthOS modules.
 * Each module can:
 *   1. Create experiments with pre-configured settings
 *   2. Record events (impressions, conversions)
 *   3. Query which variant to show for a user
 *   4. Get performance data back
 */

import type {
  ModuleSource,
  ObjectiveMetric,
  ExperimentType,
  EventType,
  GrowthVariant,
  TrafficStrategy,
} from "./types";

// ─── Variant Selection (Traffic Splitting) ───────────────────────────────────

/**
 * Deterministically assign a user to a variant using consistent hashing.
 * Same user always sees same variant (no flickering).
 */
export function selectVariant(
  userHash: string,
  variants: Array<{ id: string; allocationPercent: number; active: boolean }>
): string | null {
  const active = variants.filter((v) => v.active);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0]!.id;

  // Consistent hash: deterministic bucket assignment
  const hash = murmurhash3(userHash);
  const bucket = (hash % 10000) / 100; // 0-99.99

  let cumulative = 0;
  for (const variant of active) {
    cumulative += variant.allocationPercent;
    if (bucket < cumulative) {
      return variant.id;
    }
  }

  // Fallback to last variant
  return active[active.length - 1]!.id;
}

/**
 * MurmurHash3 (32-bit) for consistent user bucketing.
 */
function murmurhash3(key: string): number {
  let h = 0x12345678;
  for (let i = 0; i < key.length; i++) {
    let k = key.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }

  h ^= key.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
}

// ─── Module-Specific Experiment Templates ────────────────────────────────────

export interface ExperimentTemplate {
  moduleSource: ModuleSource;
  name: string;
  experimentType: ExperimentType;
  objectiveMetric: ObjectiveMetric;
  trafficStrategy: TrafficStrategy;
  testableFields: string[];
  description: string;
}

/**
 * Pre-configured experiment templates for each module.
 */
export const MODULE_TEMPLATES: Record<ModuleSource, ExperimentTemplate[]> = {
  content: [
    {
      moduleSource: "content",
      name: "Headline Test",
      experimentType: "ab",
      objectiveMetric: "ctr",
      trafficStrategy: "equal",
      testableFields: ["headline", "title"],
      description: "Test different headlines to maximize click-through rate",
    },
    {
      moduleSource: "content",
      name: "CTA Copy Test",
      experimentType: "ab",
      objectiveMetric: "conversions",
      trafficStrategy: "equal",
      testableFields: ["cta_text", "cta_style"],
      description: "Test call-to-action variations for conversion lift",
    },
    {
      moduleSource: "content",
      name: "Thumbnail Test",
      experimentType: "bandit",
      objectiveMetric: "engagement",
      trafficStrategy: "bandit",
      testableFields: ["thumbnail_url", "image"],
      description: "Test thumbnail images with automatic traffic allocation to winners",
    },
    {
      moduleSource: "content",
      name: "Description Test",
      experimentType: "ab",
      objectiveMetric: "engagement",
      trafficStrategy: "equal",
      testableFields: ["description", "body_intro"],
      description: "Test post descriptions and body intros for engagement",
    },
  ],
  publisher: [
    {
      moduleSource: "publisher",
      name: "Publish Time Test",
      experimentType: "sequential",
      objectiveMetric: "engagement",
      trafficStrategy: "sequential",
      testableFields: ["publish_time", "day_of_week"],
      description: "Find optimal posting times using sequential testing",
    },
    {
      moduleSource: "publisher",
      name: "Platform Sequencing",
      experimentType: "ab",
      objectiveMetric: "engagement",
      trafficStrategy: "equal",
      testableFields: ["platform_order", "delay_minutes"],
      description: "Test cross-posting order and timing between platforms",
    },
    {
      moduleSource: "publisher",
      name: "Caption Variation",
      experimentType: "ab",
      objectiveMetric: "ctr",
      trafficStrategy: "equal",
      testableFields: ["caption", "hashtags"],
      description: "Test caption variations per platform for click-through",
    },
  ],
  ads: [
    {
      moduleSource: "ads",
      name: "Ad Copy Test",
      experimentType: "ab",
      objectiveMetric: "ctr",
      trafficStrategy: "equal",
      testableFields: ["headline", "body", "display_url"],
      description: "Split-test ad copy variations for maximum CTR",
    },
    {
      moduleSource: "ads",
      name: "Creative Angle Test",
      experimentType: "multivariate",
      objectiveMetric: "roas",
      trafficStrategy: "equal",
      testableFields: ["angle", "hook", "image_style"],
      description: "Test creative angles and hooks for ROAS optimization",
    },
    {
      moduleSource: "ads",
      name: "Audience Test",
      experimentType: "bandit",
      objectiveMetric: "cpl",
      trafficStrategy: "bandit",
      testableFields: ["audience_id", "targeting"],
      description: "Test audience segments with bandit allocation to lowest CPL",
    },
    {
      moduleSource: "ads",
      name: "Budget Allocation Test",
      experimentType: "sequential",
      objectiveMetric: "roas",
      trafficStrategy: "sequential",
      testableFields: ["daily_budget", "bid_strategy"],
      description: "Optimize budget distribution across campaigns",
    },
  ],
  newsletter: [
    {
      moduleSource: "newsletter",
      name: "Subject Line Test",
      experimentType: "ab",
      objectiveMetric: "opens",
      trafficStrategy: "equal",
      testableFields: ["subject_line", "preview_text"],
      description: "Test subject lines to maximize open rate",
    },
    {
      moduleSource: "newsletter",
      name: "Send Time Test",
      experimentType: "sequential",
      objectiveMetric: "opens",
      trafficStrategy: "sequential",
      testableFields: ["send_time", "send_day"],
      description: "Find optimal send times for your audience",
    },
    {
      moduleSource: "newsletter",
      name: "Body Intro Test",
      experimentType: "ab",
      objectiveMetric: "clicks",
      trafficStrategy: "equal",
      testableFields: ["body_intro", "greeting_style"],
      description: "Test email opening hooks for click-through",
    },
    {
      moduleSource: "newsletter",
      name: "CTA Button Test",
      experimentType: "ab",
      objectiveMetric: "clicks",
      trafficStrategy: "equal",
      testableFields: ["cta_text", "cta_color", "cta_position"],
      description: "Test CTA button design and placement for clicks",
    },
  ],
  swarm: [
    {
      moduleSource: "swarm",
      name: "AI Strategy Test",
      experimentType: "bandit",
      objectiveMetric: "conversions",
      trafficStrategy: "bandit",
      testableFields: ["strategy_prompt", "agent_config"],
      description: "Let AI agents compete on strategy approaches",
    },
  ],
  funnel: [
    {
      moduleSource: "funnel",
      name: "Landing Page Test",
      experimentType: "ab",
      objectiveMetric: "conversions",
      trafficStrategy: "equal",
      testableFields: ["headline", "hero_image", "social_proof", "cta"],
      description: "Test landing page elements for conversion optimization",
    },
    {
      moduleSource: "funnel",
      name: "Lead Magnet Test",
      experimentType: "ab",
      objectiveMetric: "conversions",
      trafficStrategy: "equal",
      testableFields: ["offer_title", "offer_description", "form_fields"],
      description: "Test lead magnet offers and form configurations",
    },
  ],
};

// ─── Event Recording Helpers ─────────────────────────────────────────────────

export interface EventPayload {
  experimentId: string;
  variantId: string;
  eventType: EventType;
  userHash: string;
  revenueValueCents?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Build an event ID for deduplication.
 */
export function buildEventId(payload: EventPayload): string {
  return `evt_${payload.experimentId}_${payload.variantId}_${payload.eventType}_${payload.userHash}_${Date.now()}`;
}

/**
 * Map module-specific actions to event types.
 */
export const MODULE_EVENT_MAP: Record<ModuleSource, Record<string, EventType>> = {
  content: {
    view: "impression",
    click: "click",
    share: "engagement",
    comment: "engagement",
    save: "engagement",
  },
  publisher: {
    published: "impression",
    link_click: "click",
    like: "engagement",
    follow: "lead",
  },
  ads: {
    served: "impression",
    click: "click",
    lead_form: "lead",
    purchase: "purchase",
  },
  newsletter: {
    delivered: "impression",
    open: "open",
    click: "click",
    reply: "reply",
    unsubscribe: "bounce",
  },
  swarm: {
    task_completed: "engagement",
    goal_achieved: "lead",
    revenue_generated: "purchase",
  },
  funnel: {
    page_view: "impression",
    form_start: "engagement",
    form_submit: "lead",
    purchase: "purchase",
  },
};

// ─── Analytics Integration ───────────────────────────────────────���───────────

export interface ExperimentMetrics {
  experimentId: string;
  totalSpendCents: number;
  totalLeads: number;
  totalRevenueCents: number;
  cac: number;
  roas: number;
  liftPercent: number;
}

/**
 * Calculate aggregate metrics for analytics integration.
 */
export function calculateExperimentMetrics(
  variants: GrowthVariant[],
  spendCents: number
): ExperimentMetrics {
  const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
  const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);
  const totalRevenue = variants.reduce((s, v) => s + v.revenueCents, 0);

  const control = variants.find((v) => v.isControl);
  const challenger = variants.find((v) => !v.isControl);

  let liftPercent = 0;
  if (control && challenger && control.impressions > 0 && challenger.impressions > 0) {
    const controlRate = control.conversions / control.impressions;
    const challengerRate = challenger.conversions / challenger.impressions;
    liftPercent = controlRate > 0 ? ((challengerRate - controlRate) / controlRate) * 100 : 0;
  }

  return {
    experimentId: variants[0]?.experimentId ?? "",
    totalSpendCents: spendCents,
    totalLeads: totalConversions,
    totalRevenueCents: totalRevenue,
    cac: totalConversions > 0 ? spendCents / totalConversions : 0,
    roas: spendCents > 0 ? totalRevenue / spendCents : 0,
    liftPercent,
  };
}

// ─── Swarm Integration ───────────────────────────────────────────────────────

/**
 * Generate experiment suggestions for the Swarm agent.
 * Returns structured suggestions that the strategist agent can execute.
 */
export function generateSwarmSuggestions(
  recentWinners: Array<{ category: string; winning: string; lift: number }>,
  recentLosers: Array<{ category: string; losing: string }>,
  moduleSource: ModuleSource
): Array<{ suggestion: string; priority: number; expectedLift: number }> {
  const suggestions: Array<{ suggestion: string; priority: number; expectedLift: number }> = [];

  // Suggest variations of winners
  for (const winner of recentWinners.slice(0, 3)) {
    suggestions.push({
      suggestion: `Create variations of winning ${winner.category}: "${winner.winning}" — try similar angles to compound the ${winner.lift.toFixed(1)}% lift`,
      priority: 9,
      expectedLift: winner.lift * 0.5, // Conservative estimate
    });
  }

  // Suggest avoiding loser patterns
  for (const loser of recentLosers.slice(0, 2)) {
    suggestions.push({
      suggestion: `Avoid ${loser.category} patterns like "${loser.losing}" — test opposite approaches`,
      priority: 7,
      expectedLift: 5, // Low confidence estimate
    });
  }

  // Module-specific suggestions
  const templates = MODULE_TEMPLATES[moduleSource] ?? [];
  if (templates.length > 0) {
    const nextTemplate = templates[Math.floor(Math.random() * templates.length)]!;
    suggestions.push({
      suggestion: `Run a ${nextTemplate.name} — ${nextTemplate.description}`,
      priority: 6,
      expectedLift: 10,
    });
  }

  return suggestions.sort((a, b) => b.priority - a.priority);
}
