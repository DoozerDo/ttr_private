"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

interface AuthFormProps {
  mode: "login" | "register";
  returnPath?: string | null;
}

function extractAuthApiMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { message?: unknown; error?: unknown };
  if (typeof candidate.message === "string" && candidate.message.length) {
    return candidate.message;
  }
  if (Array.isArray(candidate.message)) {
    const filtered = candidate.message.filter((item): item is string => typeof item === "string");
    if (filtered.length) {
      return filtered.join(", ");
    }
  }
  if (typeof candidate.error === "string" && candidate.error.length) {
    return candidate.error;
  }
  return undefined;
}

function hasAccessCodeRequired(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { code?: unknown; message?: unknown };

  if (payload.code === "ACCESS_CODE_REQUIRED") {
    return true;
  }

  if (payload.message && typeof payload.message === "object") {
    const nestedCode = (payload.message as { code?: unknown }).code;
    if (nestedCode === "ACCESS_CODE_REQUIRED") {
      return true;
    }
  }

  return false;
}

function needsProfileCompletion(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return true;
  }

  const user = value as {
    roleTitle?: unknown;
    intendedUse?: unknown;
    profileCompletedAt?: unknown;
  };

  return !(
    typeof user.profileCompletedAt === "string" &&
    user.profileCompletedAt.length > 0 &&
    typeof user.roleTitle === "string" &&
    user.roleTitle.trim().length > 0 &&
    typeof user.intendedUse === "string" &&
    user.intendedUse.trim().length > 0
  );
}


function shouldRequireEmailVerification(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as {
    emailConfirmationRequired?: unknown;
    message?: unknown;
  };

  if (typeof payload.emailConfirmationRequired === "boolean") {
    return payload.emailConfirmationRequired;
  }

  return (
    typeof payload.message === "string" &&
    payload.message.toLowerCase().includes("check your email")
  );
}

function isEmailNotConfirmedError(message: string | undefined, status: number): boolean {
  return (
    status === 403 &&
    typeof message === "string" &&
    message.toLowerCase().includes("confirm your email")
  );
}

function isAccessRequiredError(message: string | undefined, status: number): boolean {
  return (
    status === 403 &&
    typeof message === "string" &&
    message.toLowerCase().includes("access code required")
  );
}

async function hasActiveBaseline(): Promise<boolean> {
  const response = await fetch("/api/baselines", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) {
    return false;
  }

  return payload.some((baseline) => {
    if (!baseline || typeof baseline !== "object") return false;
    const status = (baseline as { status?: unknown }).status;
    return typeof status === "string" && status.toUpperCase() !== "ARCHIVED";
  });
}

export function AuthForm({ mode, returnPath }: AuthFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false);
  const [verificationCheck, setVerificationCheck] = useState(false);

  const isLogin = mode === "login";
  const title = isLogin ? "Log in" : "Create an account";
  const actionLabel = isLogin ? "Log in" : "Create account";
  const helperText = isLogin ? "Don't have an account?" : "Already registered?";
  const helperHref = isLogin ? "/auth/signup" : "/auth/login";
  const helperLinkLabel = isLogin ? "Sign up" : "Log in";
  const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";

  const buildAwaitingAccessPath = (trimmedEmail: string) => {
    const params = new URLSearchParams();
    params.set("email", trimmedEmail);
    const safeNext = sanitizeReturnPath(returnPath);
    if (safeNext) {
      params.set("next", safeNext);
    }
    return `/awaiting-access?${params.toString()}`;
  };

  const buildRedeemPath = (trimmedEmail: string) => {
    const params = new URLSearchParams();
    params.set("email", trimmedEmail);
    const safeNext = sanitizeReturnPath(returnPath);
    if (safeNext) {
      params.set("next", safeNext);
    }
    return `/redeem?${params.toString()}`;
  };

  const handleLoginSuccess = async () => {
    const meResponse = await fetch("/api/users/me", {
      method: "GET",
      credentials: "include",
    });

    if (!meResponse.ok) {
      if (meResponse.status === 403) {
        const awaitingPath = buildAwaitingAccessPath(email.trim());
        await router.replace(awaitingPath);
        await router.refresh();
        return;
      }
      setError("Unable to continue. Please try again.");
      return;
    }

    const mePayload = meResponse.ok ? await meResponse.json().catch(() => null) : null;

    if (needsProfileCompletion(mePayload)) {
      const params = new URLSearchParams();
      params.set("next", sanitizeReturnPath(returnPath) ?? "/first-run");
      await router.replace(`/onboarding/profile?${params.toString()}`);
      await router.refresh();
      return;
    }

    const targetPath = (await hasActiveBaseline()) ? sanitizeReturnPath(returnPath) ?? "/baseline" : "/first-run";
    await router.replace(targetPath);
    await router.refresh();
  };

  const attemptLogin = async (trimmedEmail: string, allowConfirmError = false) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: trimmedEmail, password }),
    });

    let data: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const messageFromApi = extractAuthApiMessage(data) ?? "Login failed";

      if (response.status === 403 && hasAccessCodeRequired(data)) {
        setError("This beta invite still needs a code. Redeem access to continue.");
        router.push(buildRedeemPath(trimmedEmail));
        return;
      }

      if (isAccessRequiredError(messageFromApi, response.status)) {
        setError("This beta invite still needs a code. Redeem access to continue.");
        router.push(buildRedeemPath(trimmedEmail));
        return;
      }

      if (allowConfirmError && isEmailNotConfirmedError(messageFromApi, response.status)) {
        setError(
          "We still do not see a verified email address. Please check your inbox and click the verification link.",
        );
        return;
      }

      setError(messageFromApi);
      return;
    }

    await handleLoginSuccess();
  };

  const resendConfirmation = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required to resend confirmation.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsResendingConfirmation(true);

    try {
      const response = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        setError(extractAuthApiMessage(payload) ?? "Unable to send another confirmation email.");
        return;
      }

      setMessage(
        extractAuthApiMessage(payload) ??
          "If this email exists, a new confirmation email has been sent.",
      );
    } catch (submitError) {
      console.error("Resend confirmation failed", submitError);
      setError("Unable to reach authentication service");
    } finally {
      setIsResendingConfirmation(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    if (!isLogin && (!firstName.trim() || !lastName.trim())) {
      setError("First name and last name are required.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isLogin) {
        await attemptLogin(trimmedEmail);
        return;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: trimmedEmail,
          password,
          confirmPassword,
        }),
      });

      let data: unknown = null;

      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
      }

      if (!response.ok) {
        const messageFromApi = extractAuthApiMessage(data) ?? "Registration failed";
        setError(messageFromApi);
        return;
      }

      const requiresVerification = shouldRequireEmailVerification(data);
      setAwaitingVerification(requiresVerification);
      setVerificationCheck(false);

      const successMessage =
        extractAuthApiMessage(data) ??
        (requiresVerification
          ? "Check your inbox for a verification email from Target This Role, then come back to redeem access."
          : "Account created. Next, redeem your beta access code.");
      setMessage(successMessage);

      if (!requiresVerification) {
        await router.replace(buildAwaitingAccessPath(trimmedEmail));
        await router.refresh();
      }
    } catch (submitError) {
      console.error("Auth request failed", submitError);
      setError("Unable to reach authentication service");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onVerifiedClick = async () => {
    setError(null);
    setMessage(null);
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await attemptLogin(trimmedEmail, true);
    } catch (submitError) {
      console.error("Verification login failed", submitError);
      setError("Unable to reach authentication service");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <p className="text-sm text-slate-300">
          {isLogin
            ? "Sign in with the email tied to your invite. If access is still pending, we will route you to redemption."
            : "Create your account with the email tied to your invite. If a code is needed, you will redeem it next."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-white/10 bg-white p-6 shadow-lg">
        {!awaitingVerification && (
          <>
            {!isLogin && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700" htmlFor="firstName">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    required={!isLogin}
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="First name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700" htmlFor="lastName">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    required={!isLogin}
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Last name"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700" htmlFor="email">
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
              <label className="block text-sm font-semibold text-gray-700" htmlFor="password">
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

            {!isLogin && (
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
            )}
          </>
        )}

        {!isLogin && awaitingVerification && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Email verification</p>
            <h2 className="text-3xl font-bold text-slate-900">Verify your email</h2>
            <p className="text-sm text-slate-700">
              Check your inbox for a verification email from Target This Role. Once verified, return here and continue to access.
            </p>

            <label className="flex items-start gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={verificationCheck}
                onChange={(event) => setVerificationCheck(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>I have clicked the verification link in my email.</span>
            </label>

            <button
              type="button"
              onClick={onVerifiedClick}
              disabled={isSubmitting || !verificationCheck}
              className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Checking..." : "I have verified my email"}
            </button>

            <p className="text-sm text-slate-700">
              Don&apos;t see the email?{" "}
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={isResendingConfirmation}
                className="font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResendingConfirmation ? "Sending..." : "Send another confirmation."}
              </button>
            </p>
          </div>
        )}

        {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

        {error && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}
        {isLogin && (
          <p className="text-sm text-slate-700">
            <Link href="/auth/forgot-password" className="font-semibold text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </p>
        )}

        {!awaitingVerification && (
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Working..." : actionLabel}
          </button>
        )}
      </form>

      <p className="text-center text-sm text-slate-200">
        {helperText}{" "}
        <Link href={helperHref} className="font-semibold text-blue-300 hover:underline">
          {helperLinkLabel}
        </Link>
      </p>
    </div>
  );
}
