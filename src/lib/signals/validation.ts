/**
 * Social Listening — Validation schemas
 */

import {
  SIGNAL_TYPES,
  SOURCE_PLATFORMS,
  KEYWORD_TYPES,
  ALERT_TYPES,
  SIGNAL_STATUSES,
  ACTION_TYPES,
  type SignalType,
  type SourcePlatform,
  type KeywordType,
  type AlertType,
  type SignalStatus,
  type ActionType,
} from "./types";

// ═══════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

// ═══════════════════════════════════════════
// Listening Source Validation
// ═══════════════════════════════════════════

export interface CreateSourceInput {
  name: string;
  sourceType: SourcePlatform;
  config: Record<string, unknown>;
  scanFrequencyMinutes?: number;
}

export function validateCreateSource(input: unknown): {
  ok: true;
  data: CreateSourceInput;
} | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Input must be an object" };
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    return { ok: false, error: "Name is required" };
  }

  if (!isOneOf(obj.sourceType, SOURCE_PLATFORMS)) {
    return { ok: false, error: `Invalid source type. Must be one of: ${SOURCE_PLATFORMS.join(", ")}` };
  }

  if (!obj.config || typeof obj.config !== "object") {
    return { ok: false, error: "Config must be an object" };
  }

  const freq = obj.scanFrequencyMinutes;
  if (freq !== undefined && (typeof freq !== "number" || freq < 5 || freq > 1440)) {
    return { ok: false, error: "Scan frequency must be between 5 and 1440 minutes" };
  }

  return {
    ok: true,
    data: {
      name: obj.name.trim(),
      sourceType: obj.sourceType as SourcePlatform,
      config: obj.config as Record<string, unknown>,
      scanFrequencyMinutes: typeof freq === "number" ? freq : 60,
    },
  };
}

// ═══════════════════════════════════════════
// Tracked Keyword Validation
// ═══════════════════════════════════════════

export interface CreateKeywordInput {
  keyword: string;
  keywordType: KeywordType;
}

export function validateCreateKeyword(input: unknown): {
  ok: true;
  data: CreateKeywordInput;
} | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Input must be an object" };
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.keyword !== "string" || obj.keyword.trim().length === 0) {
    return { ok: false, error: "Keyword is required" };
  }

  if (obj.keyword.trim().length > 200) {
    return { ok: false, error: "Keyword must be under 200 characters" };
  }

  if (!isOneOf(obj.keywordType, KEYWORD_TYPES)) {
    return { ok: false, error: `Invalid keyword type. Must be one of: ${KEYWORD_TYPES.join(", ")}` };
  }

  return {
    ok: true,
    data: {
      keyword: obj.keyword.trim(),
      keywordType: obj.keywordType as KeywordType,
    },
  };
}

// ═══════════════════════════════════════════
// Signal Alert Validation
// ═══════════════════════════════════════════

export interface CreateAlertInput {
  name: string;
  alertType: AlertType;
  conditions: {
    minPriority?: number;
    signalTypes?: SignalType[];
    platforms?: SourcePlatform[];
    keywords?: string[];
  };
  notifyMethod: "in_app" | "email" | "slack" | "webhook";
  notifyTarget?: string;
}

export function validateCreateAlert(input: unknown): {
  ok: true;
  data: CreateAlertInput;
} | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Input must be an object" };
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    return { ok: false, error: "Alert name is required" };
  }

  if (!isOneOf(obj.alertType, ALERT_TYPES)) {
    return { ok: false, error: `Invalid alert type. Must be one of: ${ALERT_TYPES.join(", ")}` };
  }

  const notifyMethods = ["in_app", "email", "slack", "webhook"] as const;
  if (!isOneOf(obj.notifyMethod, notifyMethods)) {
    return { ok: false, error: "Invalid notify method" };
  }

  const conditions = (obj.conditions ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    data: {
      name: obj.name.trim(),
      alertType: obj.alertType as AlertType,
      conditions: {
        minPriority: typeof conditions.minPriority === "number" ? conditions.minPriority : undefined,
        signalTypes: Array.isArray(conditions.signalTypes) ? conditions.signalTypes.filter((t): t is SignalType => isOneOf(t, SIGNAL_TYPES)) : undefined,
        platforms: Array.isArray(conditions.platforms) ? conditions.platforms.filter((p): p is SourcePlatform => isOneOf(p, SOURCE_PLATFORMS)) : undefined,
        keywords: Array.isArray(conditions.keywords) ? conditions.keywords.filter((k): k is string => typeof k === "string") : undefined,
      },
      notifyMethod: obj.notifyMethod as CreateAlertInput["notifyMethod"],
      notifyTarget: typeof obj.notifyTarget === "string" ? obj.notifyTarget : undefined,
    },
  };
}

// ═══════════════════════════════════════════
// Signal Status Update Validation
// ═══════════════════════════════════════════

export function validateSignalStatus(status: unknown): status is SignalStatus {
  return isOneOf(status, SIGNAL_STATUSES);
}

export function validateSignalType(type: unknown): type is SignalType {
  return isOneOf(type, SIGNAL_TYPES);
}

export function validateActionType(type: unknown): type is ActionType {
  return isOneOf(type, ACTION_TYPES);
}
