import { sanitizeReturnPath } from "@/src/lib/safe-redirect";
import { AccessCodeForm } from "./access-code-form";

type SearchParams = {
  email?: string | string[];
  next?: string | string[];
};

type AccessCodePageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

export default async function AccessCodePage({ searchParams }: AccessCodePageProps) {
  const sp = (await Promise.resolve(searchParams)) ?? {};

  const emailParam = Array.isArray(sp.email) ? sp.email[0] : sp.email;
  const nextParam = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const safeNext = sanitizeReturnPath(nextParam) ?? "/baseline";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <AccessCodeForm initialEmail={emailParam ?? ""} returnPath={safeNext} />
    </main>
  );
}
