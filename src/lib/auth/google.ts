import { Google } from "arctic";
import { getBindings } from "@/lib/cloudflare/bindings";

/**
 * Create a Google OAuth client using Arctic.
 */
export function createGoogleClient(): Google {
  const env = getBindings();
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.APP_URL}/callback/google`
  );
}

/**
 * Google user profile returned from the userinfo endpoint.
 */
export interface GoogleUserProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}

/**
 * Fetch the user's Google profile using an access token.
 */
export async function fetchGoogleProfile(
  accessToken: string
): Promise<GoogleUserProfile> {
  const response = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Google profile: ${response.status}`);
  }

  return response.json() as Promise<GoogleUserProfile>;
}
