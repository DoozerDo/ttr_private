import { AuthForm } from "../_components/auth-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <AuthForm mode="register" />
    </main>
  );
}
