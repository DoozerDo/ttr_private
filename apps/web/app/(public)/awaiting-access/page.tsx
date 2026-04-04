import Link from "next/link";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

type SearchParams = {
  email?: string | string[];
  next?: string | string[];
};

type AwaitingAccessPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export default async function AwaitingAccessPage({
  searchParams,
}: AwaitingAccessPageProps) {
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const emailParam = Array.isArray(sp.email) ? sp.email[0] : sp.email;
  const nextParam = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const safeNext = sanitizeReturnPath(nextParam) ?? "/baseline";

  const redeemParams = new URLSearchParams();
  if (emailParam) {
    redeemParams.set("email", emailParam);
  }
  redeemParams.set("next", safeNext);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="mx-auto w-full max-w-xl space-y-5 rounded-xl border border-white/10 bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">Your beta account is ready</h1>
        <p className="text-sm text-slate-700">
          Your account exists, but beta access is not active yet. Redeem your invite code to continue.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/redeem?${redeemParams.toString()}`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
          Redeem access code
          </Link>
          <Link
            href="/auth/login"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Back to login
          </Link>
        </div>
        <p className="text-xs text-slate-500">
          If you do not have a code yet, ask the person who invited you for the next step.
        </p>
      </div>
    </main>
  );
}
