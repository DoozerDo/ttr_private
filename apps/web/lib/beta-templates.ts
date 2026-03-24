export const BETA_WELCOME_EMAIL_SUBJECT = "Your Target This Role Beta Access";

export const BETA_GUIDE_DISMISS_KEY = "ttr_beta_guide_dismissed";

type BetaTemplateBaseParams = {
  accessCode: string;
  appUrl: string;
  betaUrl: string;
  discordUrl: string;
};

export type BetaWelcomeEmailTemplateParams = BetaTemplateBaseParams & {
  senderName: string;
};

export function buildBetaWelcomeEmailTemplate({
  accessCode,
  appUrl,
  betaUrl,
  discordUrl,
  senderName,
}: BetaWelcomeEmailTemplateParams) {
  const body = `Hi,

You've been given early access to Target This Role.

Access Code:
${accessCode}

Use it here:
${appUrl}

Before you start, read this:
${betaUrl}

That page explains exactly how to test the product and what we're looking for. Please follow it. Random testing does not help us improve the system.

What this product does:
It evaluates whether you actually qualify for a role, identifies real gaps, and only generates materials when the signal holds up.

What we need from you:
Run four job descriptions through the system:
- One you are overqualified for
- One you are qualified for
- One that is a reach
- One that is clearly out of range

Then report anything that breaks, feels wrong, or is confusing.

Support and bug reporting:
We are handling all beta feedback through Discord:
${discordUrl}

Use the bug format from the beta page when reporting issues. Reports without clear steps or the job description used are difficult to act on.

This is a beta. You will hit rough edges. That is expected.

--${senderName}`;

  return {
    subject: BETA_WELCOME_EMAIL_SUBJECT,
    body,
  };
}

export type BetaWelcomeDmTemplateParams = BetaTemplateBaseParams;

export function buildBetaWelcomeDmTemplate({
  accessCode,
  appUrl,
  betaUrl,
  discordUrl,
}: BetaWelcomeDmTemplateParams) {
  return `You're in.

Access Code:
${accessCode}

Start here:
${appUrl}

Read this before doing anything:
${betaUrl}

Run four JDs through the system:
- overqualified
- qualified
- reach
- stretch

Support and bug reporting are handled in Discord:
${discordUrl}

Use the bug template from the beta page. If we cannot reproduce it, we cannot fix it.`;
}
