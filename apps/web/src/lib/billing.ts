const truthyValues = new Set(['true', '1', 'yes', 'on']);

function parseFlag(value?: string): boolean {
  if (!value) return false;
  return truthyValues.has(value.trim().toLowerCase());
}

const SUPPORT_EMAIL = 'support@targetthisrole.ai';
const SUPPORT_SUBJECT = encodeURIComponent('Target This Role billing question');
const WAITLIST_EMAIL_ADDRESS = 'hello@targetthisrole.ai';
const WAITLIST_SUBJECT_TEXT = encodeURIComponent('Waitlist request');

export const WAITLIST_ROUTE = '/waitlist';
export const BILLING_SUPPORT_EMAIL = SUPPORT_EMAIL;
export const BILLING_SUPPORT_LINK = `mailto:${SUPPORT_EMAIL}?subject=${SUPPORT_SUBJECT}`;
export const WAITLIST_EMAIL = WAITLIST_EMAIL_ADDRESS;
export const WAITLIST_SUBJECT = WAITLIST_SUBJECT_TEXT;
export const WAITLIST_LINK = `mailto:${WAITLIST_EMAIL_ADDRESS}?subject=${WAITLIST_SUBJECT_TEXT}`;

export type BillingConfig = {
  billingLive: boolean;
  betaUnlockPro: boolean;
};

export function getBillingConfig(): BillingConfig {
  return {
    billingLive: parseFlag(process.env.NEXT_PUBLIC_BILLING_LIVE),
    betaUnlockPro: parseFlag(process.env.NEXT_PUBLIC_BETA_UNLOCK_PRO),
  };
}
