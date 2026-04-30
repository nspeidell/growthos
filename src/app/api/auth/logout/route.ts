export const runtime = 'edge';

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * POST /api/auth/logout
 * Destroys the session and clears the cookie.
 */
export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const response = NextResponse.redirect(new URL("/login", "http://localhost:3000"));
  response.cookies.delete(SESSION_COOKIE_NAME);

  return response;
}
