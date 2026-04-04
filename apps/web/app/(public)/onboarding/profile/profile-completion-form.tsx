"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";

export function ProfileCompletionForm({ returnPath }: { returnPath: string }) {
  const router = useRouter();
  const [roleTitle, setRoleTitle] = useState("");
  const [company, setCompany] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!roleTitle.trim() || !intendedUse.trim()) {
      setError("Role title and intended use are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roleTitle: roleTitle.trim(),
          company: company.trim() || undefined,
          linkedinUrl: linkedinUrl.trim() || undefined,
          intendedUse: intendedUse.trim(),
        }),
      });

      if (!response.ok) {
        const raw = await response.text();
        setError(raw || "Unable to save profile");
        return;
      }

      const target = sanitizeReturnPath(returnPath) ?? "/baseline";
      router.replace(target);
      router.refresh();
    } catch {
      setError("Unable to save profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">Complete your profile</h1>
        <p className="text-sm text-slate-300">Tell us how you plan to use Target This Role.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <label className="block space-y-1 text-sm text-slate-700">
          <span className="font-medium">Role title</span>
          <input id="role-title" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm text-slate-700">
          <span className="font-medium">Company (optional)</span>
          <input id="company" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm text-slate-700">
          <span className="font-medium">LinkedIn URL (optional)</span>
          <input id="linkedin-url" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm text-slate-700">
          <span className="font-medium">How do you intend to use the app?</span>
          <textarea id="intended-use" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={intendedUse} onChange={(e) => setIntendedUse(e.target.value)} required rows={4} />
        </label>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {isSubmitting ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
