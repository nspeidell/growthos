#!/usr/bin/env npx tsx
/**
 * validate-env.ts
 *
 * Reads .env.example and checks that all required environment variables
 * are present in the current environment (or .env.local).
 *
 * Usage:
 *   npx tsx scripts/validate-env.ts
 *   npx tsx scripts/validate-env.ts --strict  (treats optional as required)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const STRICT = process.argv.includes("--strict");

// ─── Parse .env.example ───

const envExamplePath = resolve(__dirname, "../.env.example");
const content = readFileSync(envExamplePath, "utf-8");

interface EnvVar {
  name: string;
  required: boolean;
  comment: string;
}

const vars: EnvVar[] = [];
let lastComment = "";

for (const line of content.split("\n")) {
  const trimmed = line.trim();

  if (trimmed.startsWith("#") && !trimmed.includes("=")) {
    // Pure comment line — could be a section header or note
    lastComment = trimmed.replace(/^#+\s*/, "");
    continue;
  }

  // Commented-out var: # VAR_NAME= or # VAR_NAME=value
  const commentedMatch = trimmed.match(/^#\s*([A-Z][A-Z0-9_]*)=/);
  if (commentedMatch?.[1]) {
    vars.push({
      name: commentedMatch[1],
      required: false,
      comment: lastComment,
    });
    lastComment = "";
    continue;
  }

  // Active var: VAR_NAME= or VAR_NAME=value
  const activeMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)=/);
  if (activeMatch?.[1]) {
    vars.push({
      name: activeMatch[1],
      required: true,
      comment: lastComment,
    });
    lastComment = "";
  }
}

// ─── Load .env.local if it exists ───

try {
  const envLocalPath = resolve(__dirname, "../.env.local");
  const localContent = readFileSync(envLocalPath, "utf-8");
  for (const line of localContent.split("\n")) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.+)/);
    if (match?.[1] && match[2]) {
      process.env[match[1]] = match[2];
    }
  }
} catch {
  // .env.local doesn't exist — that's fine, check process.env only
}

// ─── Validate ───

let hasErrors = false;
const results: Array<{ name: string; status: string; required: boolean }> = [];

for (const v of vars) {
  const isRequired = STRICT || v.required;
  const value = process.env[v.name];
  const hasValue = value !== undefined && value !== "";

  if (isRequired && !hasValue) {
    results.push({ name: v.name, status: "❌ MISSING", required: true });
    hasErrors = true;
  } else if (!isRequired && !hasValue) {
    results.push({ name: v.name, status: "⚪ optional (not set)", required: false });
  } else {
    results.push({ name: v.name, status: "✅ set", required: v.required });
  }
}

// ─── Output ───

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║     GrowthOS Environment Validation         ║");
console.log("╚══════════════════════════════════════════════╝\n");

const maxName = Math.max(...results.map((r) => r.name.length));

for (const r of results) {
  console.log(`  ${r.status.padEnd(22)} ${r.name.padEnd(maxName + 2)}`);
}

const required = results.filter((r) => r.required);
const optional = results.filter((r) => !r.required);
const missingRequired = required.filter((r) => r.status.includes("MISSING"));
const missingOptional = optional.filter((r) => r.status.includes("optional"));

console.log(`\n  Summary:`);
console.log(`    Required: ${required.length - missingRequired.length}/${required.length} set`);
console.log(`    Optional: ${optional.length - missingOptional.length}/${optional.length} set`);

if (hasErrors) {
  console.log(
    `\n  ⚠️  ${missingRequired.length} required variable(s) missing. Set them in .env.local or your deployment environment.\n`
  );
  process.exit(1);
} else {
  console.log(`\n  ✅ All required variables are set.\n`);
  process.exit(0);
}
