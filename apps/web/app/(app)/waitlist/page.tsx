'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Alert } from '@/components/Alert';
import { FormButton } from '@/components/FormButton';
import { PageHeader } from '@/components/PageHeader';
import { PageShell } from '@/components/PageShell';
import { useEntitlements } from '@/src/lib/entitlements';
import { WAITLIST_EMAIL, WAITLIST_SUBJECT } from '@/src/lib/billing';

export default function WaitlistPage() {
  const { profile } = useEntitlements();
  const accountEmail = profile?.email;

  const templateBody = useMemo(() => {
    const lines = [
      'Hi Target This Role team,',
      '',
      "I'd love to be added to the billing waitlist for Target This Role.",
    ];

    if (accountEmail) {
      lines.push('');
      lines.push(`My account email is ${accountEmail}.`);
    }

    lines.push('', 'Thanks!');
    return lines.join('\n');
  }, [accountEmail]);

  const mailto = useMemo(() => {
    const encodedBody = encodeURIComponent(templateBody);
    return `mailto:${WAITLIST_EMAIL}?subject=${WAITLIST_SUBJECT}&body=${encodedBody}`;
  }, [templateBody]);

  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleEmail = () => {
    window.location.href = mailto;
  };

  const handleCopy = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(templateBody);
      setCopied(true);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : 'Unable to copy email text.');
    }
  };

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <PageShell className="space-y-6">
      <PageHeader
        kicker="Billing"
        title="Join the waitlist"
        description="Billing is not live yet, but we’ll email you before the rollout starts."
      />

      <Alert intent="warning">
        Billing is still in beta. We’ll let early adopters join as soon as the platform is ready to accept payments.
      </Alert>

      <section className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
        <p className="text-sm text-slate-200">
          You can still explore the product; just drop us a note so we know you’re interested. Once billing opens,
          we’ll contact you with next steps.
        </p>

        <div className="flex flex-wrap gap-3">
          <FormButton onClick={handleEmail}>Email support</FormButton>
          <FormButton variant="secondary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy email"}
          </FormButton>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/40 hover:text-amber-200"
          >
            Back to pricing
          </Link>
        </div>
        {copied ? (
          <div className="text-xs text-emerald-300">Copied</div>
        ) : null}
        {copyError ? <Alert intent="error">{copyError}</Alert> : null}
      </section>
    </PageShell>
  );
}
