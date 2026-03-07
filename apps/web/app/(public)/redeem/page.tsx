import { sanitizeReturnPath } from "@/src/lib/safe-redirect";
import { AccessCodeForm } from "../auth/access-code/access-code-form";

type SearchParams = {
  code?: string | string[];
  email?: string | string[];
  next?: string | string[];
};

type RedeemPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export default async function RedeemPage({ searchParams }: RedeemPageProps) {
  const sp = (await Promise.resolve(searchParams)) ?? {};

  const codeParam = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const emailParam = Array.isArray(sp.email) ? sp.email[0] : sp.email;
  const nextParam = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const safeNext = sanitizeReturnPath(nextParam) ?? "/baseline";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <AccessCodeForm
        initialEmail={emailParam ?? ""}
        initialCode={codeParam ?? ""}
        returnPath={safeNext}
      />
    </main>
  );
}
