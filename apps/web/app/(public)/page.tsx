import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { LandingPage } from "@/src/components/landing/LandingPage";

export default async function PublicHomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  return <LandingPage isAuthenticated={Boolean(token)} />;
}
