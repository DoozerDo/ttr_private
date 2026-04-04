import { AuthForm } from "../_components/auth-form";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

type SearchParams = {
  next?: string | string[];
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const nextParam = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const safeNext = sanitizeReturnPath(nextParam);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <AuthForm mode="register" returnPath={safeNext} />
    </main>
  );
}
