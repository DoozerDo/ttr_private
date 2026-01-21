import { AuthForm } from "../_components/auth-form";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

type LoginPageProps = {
  searchParams?: {
    next?: string | string[] | undefined;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const param = Array.isArray(searchParams?.next)
    ? searchParams.next[0]
    : searchParams?.next;
  const safeNext = sanitizeReturnPath(param);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <AuthForm mode="login" returnPath={safeNext} />
    </main>
  );
}
