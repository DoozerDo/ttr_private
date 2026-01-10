import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/src/components/layout/AppShell";
import { AUTH_COOKIE_NAME, decodeJwt } from "@/lib/auth";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const payload = token ? decodeJwt(token) : null;

  return <AppShell userEmail={payload?.email ?? null}>{children}</AppShell>;
}
