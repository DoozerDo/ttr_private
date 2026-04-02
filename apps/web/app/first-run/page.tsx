import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { FirstRunClient } from "./FirstRunClient";

export default async function FirstRunPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login?next=/first-run");
  }

  return <FirstRunClient />;
}
