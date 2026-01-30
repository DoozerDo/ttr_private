import { AuthForm } from "../_components/auth-form";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

type SearchParams = {
  next?: string | string[];
};

type LoginPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sp = (await Promise.resolve(searchParams)) ?? {};

  const param = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const safeNext = sanitizeReturnPath(param);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <AuthForm mode="login" returnPath={safeNext} />
    </main>
  );
}
