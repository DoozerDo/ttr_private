"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLogin = mode === "login";
  const title = isLogin ? "Log in" : "Create an account";
  const actionLabel = isLogin ? "Log in" : "Register";
  const helperText = isLogin ? "Don't have an account?" : "Already registered?";
  const helperHref = isLogin ? "/auth/register" : "/auth/login";
  const helperLinkLabel = isLogin ? "Sign up" : "Log in";
  const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      let data: any = null;

      // Try to parse JSON if there is a body; ignore parse errors
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          // non-JSON body (e.g. 404 HTML) – data stays null
        }
      }

      if (!response.ok) {
        const messageFromApi =
          (typeof data?.message === "string" && data.message) ||
          (Array.isArray(data?.message) && data.message.join(", ")) ||
          (typeof data?.error === "string" && data.error) ||
          (isLogin ? "Login failed" : "Registration failed");

        setError(messageFromApi);
        return;
      }

      // At this point, the API route should have:
      // - validated credentials
      // - set the auth cookie
      // We just navigate.
      router.push("/");
    } catch (submitError) {
      console.error("Auth request failed", submitError);
      setError("Unable to reach authentication service");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-600">
          Use your Target This Role credentials to continue.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-2">
          <label
            className="block text-sm font-semibold text-gray-700"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <label
            className="block text-sm font-semibold text-gray-700"
            htmlFor="password"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Working..." : actionLabel}
        </button>
      </form>

      <p className="text-center text-sm text-gray-700">
        {helperText}{" "}
        <Link
          href={helperHref}
          className="font-semibold text-blue-600 hover:underline"
        >
          {helperLinkLabel}
        </Link>
      </p>
    </div>
  );
}
