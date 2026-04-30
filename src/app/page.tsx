import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/auth/middleware";

export const runtime = 'edge';

/**
 * Root page — redirect to dashboard if authenticated, login if not.
 */
export default async function RootPage() {
  const session = await getOptionalSession();

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
