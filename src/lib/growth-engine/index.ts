/**
 * Growth Optimization Engine — Public API
 *
 * Barrel export for all growth engine modules.
 */

// Core types
export type * from "./types";

// Statistics engine
export {
  zTestProportions,
  chiSquareTest,
  bayesianTest,
  sequentialTest,
  thompsonSamplingAllocation,
  estimateSampleSize,
  sampleRatioMismatchTest,
  detectConversionAnomaly,
} from "./stats";

// Decision engine
export { evaluateExperiment, evaluateAllExperiments } from "./decision-engine";

// Integrations
export {
  selectVariant,
  MODULE_TEMPLATES,
  MODULE_EVENT_MAP,
  buildEventId,
  calculateExperimentMetrics,
  generateSwarmSuggestions,
} from "./integrations";

// AI Generator
export { generateVariants, generateInsightDrivenVariants } from "./ai-generator";

// Autonomous mode
export {
  runAutonomousPipeline,
  calculateVelocity,
  DEFAULT_AUTO_CONFIG,
} from "./autonomous";

// Enterprise safety
export {
  evaluateSafetyGate,
  checkExperimentPermission,
  checkRateLimit,
  shouldAutoRollback,
  DEFAULT_RATE_LIMITS,
} from "./safety";

// Insight moat
export {
  extractInsights,
  mergeInsight,
  scoreInsightsForContext,
  summarizeInsightMoat,
} from "./insights";

// Validation schemas
export {
  createExperimentSchema,
  recordEventSchema,
  updateExperimentSchema,
  variantGeneratorInputSchema,
  autoOptimizeConfigSchema,
} from "./validation";
