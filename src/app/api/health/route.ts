/**
 * Health Check Endpoint
 *
 * Returns basic app status. Used for:
 * - Uptime monitoring
 * - Post-deploy verification
 * - Load balancer health checks
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "0.5",
    timestamp: new Date().toISOString(),
    environment: process.env.ENVIRONMENT ?? "unknown",
  });
}
