import {
  buildVerificationBaselineEvidence,
  evaluateToolCoverage,
  evaluateRequirementEvidence,
  findVerifiedEvidenceRefs,
  normalizeRequirementText,
} from './tool-extractor';

describe('tool claim verification weighting', () => {
  it('normalizes punctuation and separator variants for requirement matching', () => {
    expect(normalizeRequirementText('Self-service')).toBe('self service');
    expect(normalizeRequirementText('self service')).toBe('self service');
    expect(normalizeRequirementText('Self/Service')).toBe('self service');
  });

  it('builds baseline corpus from full text and sections without skills-only dependency', () => {
    const corpus = buildVerificationBaselineEvidence({
      text: 'Profile summary line.',
      sections: [
        { title: 'Experience', content: 'Owned Salesforce Service Cloud workflows.\nBuilt self service support flows.' },
        { title: 'Skills', content: 'Zendesk, Jira' },
      ],
    });
    const flattened = corpus.map((entry) => entry.text).join(' | ');
    expect(flattened).toContain('Profile summary line.');
    expect(flattened).toContain('Owned Salesforce Service Cloud workflows.');
    expect(flattened).toContain('Built self service support flows.');
    expect(flattened).toContain('Zendesk, Jira');
  });

  it('preserves structured evidence when raw baseline text is also present', () => {
    const corpus = buildVerificationBaselineEvidence({
      text: 'Combined summary blob mentioning broad support operations.',
      sections: [
        { type: 'Skills', content: 'Zendesk, Jira' },
        {
          type: 'Experience',
          content: 'Owned escalation workflows in Salesforce Service Cloud.',
        },
      ],
    });

    expect(corpus.length).toBeGreaterThan(1);
    expect(corpus.some((entry) => entry.source?.startsWith('baseline_section:'))).toBe(true);
    expect(corpus.some((entry) => entry.source?.startsWith('baseline_section_line:'))).toBe(true);
    expect(corpus.filter((entry) => entry.source === 'baseline_text').length).toBe(1);
    expect(
      corpus.some((entry) =>
        entry.text.toLowerCase().includes('salesforce service cloud'),
      ),
    ).toBe(true);
  });

  it('falls back to baseline_text only when structured sections are unavailable', () => {
    const corpus = buildVerificationBaselineEvidence({
      text: 'Only raw baseline text with Salesforce mention.',
      sections: [],
    });

    expect(corpus).toHaveLength(1);
    expect(corpus[0].source).toBe('baseline_text');
  });

  it('weights VERIFIED full, INFERRED partial, UNVERIFIED zero for tooling coverage', () => {
    const jobText = `
      Must have Salesforce and ServiceNow experience.
      Preferred: Zendesk.
    `;
    const baselineText = `
      Led support operations in Zendesk environments and managed ticketing system workflows.
    `;

    const coverage = evaluateToolCoverage(jobText, baselineText);

    const salesforce = coverage.claims.find((claim) => claim.key === 'salesforce');
    const servicenow = coverage.claims.find((claim) => claim.key === 'servicenow');
    const zendesk = coverage.claims.find((claim) => claim.key === 'zendesk');

    expect(salesforce?.status).toBe('UNVERIFIED');
    expect(servicenow?.status).toBe('INFERRED');
    expect(zendesk?.status).toBe('VERIFIED');

    expect(coverage.requiredCoverage).toBeCloseTo(0.2, 4);
    expect(coverage.preferredCoverage).toBeCloseTo(1, 4);
  });

  it('does not mark named platforms as VERIFIED from loose adjacent wording alone', () => {
    const jobText = `Must have Five9 and Salesforce experience.`;
    const baselineText = `Led multi-system support operations and customer platform migrations.`;

    const coverage = evaluateToolCoverage(jobText, baselineText);
    const five9 = coverage.claims.find((claim) => claim.key === 'five9');
    const salesforce = coverage.claims.find((claim) => claim.key === 'salesforce');

    expect(five9?.status).not.toBe('VERIFIED');
    expect(salesforce?.status).not.toBe('VERIFIED');
  });

  it('can infer adjacent named platform support from defensible baseline signals without promoting to verified', () => {
    const jobText = `Must have Five9 and Salesforce experience.`;
    const baselineText = `
      Led contact center operations with voice support queues.
      Partnered with CRM teams and managed ticketing system routing.
    `;

    const coverage = evaluateToolCoverage(jobText, baselineText);
    const five9 = coverage.claims.find((claim) => claim.key === 'five9');
    const salesforce = coverage.claims.find((claim) => claim.key === 'salesforce');

    expect(five9?.status).toBe('UNVERIFIED');
    expect(salesforce?.status).toBe('UNVERIFIED');
    expect(five9?.generationBlocking).toBe(true);
    expect(salesforce?.generationBlocking).toBe(true);
  });

  it('verifies Salesforce from tightly controlled variants and rejects generic CRM-only language', () => {
    expect(
      findVerifiedEvidenceRefs('Salesforce', 'Led support transformations in Salesforce Service Cloud.'),
    ).toContain('salesforce service cloud');
    expect(
      findVerifiedEvidenceRefs('Salesforce', 'Owned SFDC administration and case routing.'),
    ).toContain('sfdc');
    expect(
      findVerifiedEvidenceRefs('Salesforce', 'Worked with CRM tools across support teams.'),
    ).toEqual([]);
  });

  it('supports conservative containment for requirement evidence after normalization', () => {
    expect(
      findVerifiedEvidenceRefs(
        'Salesforce',
        'Led support systems optimization in Salesforce Service Cloud.',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      findVerifiedEvidenceRefs(
        'self-service support',
        'Built self service experiences for customers across support channels.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('keeps platform strictness when baseline only has adjacent generic language', () => {
    const coverage = evaluateToolCoverage(
      'Must have Five9 and Salesforce experience.',
      'Operated CRM tools and contact center systems with no named platforms.',
    );
    const five9 = coverage.claims.find((claim) => claim.key === 'five9');
    const salesforce = coverage.claims.find((claim) => claim.key === 'salesforce');
    expect(five9?.status).toBe('UNVERIFIED');
    expect(salesforce?.status).toBe('UNVERIFIED');
    expect(five9?.evidenceRefs).not.toContain('five9');
    expect(salesforce?.evidenceRefs).not.toContain('salesforce');
    expect(salesforce?.status).not.toBe('VERIFIED');
    expect(five9?.status).not.toBe('VERIFIED');
  });

  it('scores Salesforce requirement as VERIFIED when evidence contains Salesforce Service Cloud', () => {
    const result = evaluateRequirementEvidence('Salesforce', [
      'Led support systems optimization in Salesforce Service Cloud.',
    ], { isPlatformRequirement: true });
    expect(result.status).toBe('VERIFIED');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.matchType).toMatch(/alias|containment/);
  });

  it('verifies Salesforce requirement from SFDC alias evidence', () => {
    const result = evaluateRequirementEvidence(
      'Salesforce',
      ['Owned SFDC case routing and escalation workflows.'],
      { isPlatformRequirement: true },
    );
    expect(result.status).toBe('VERIFIED');
    expect(result.matchType).toBe('alias');
  });

  it('does not verify Salesforce from generic CRM-only wording', () => {
    const result = evaluateRequirementEvidence(
      'Salesforce',
      ['Worked with CRM tools across support operations.'],
      { isPlatformRequirement: true },
    );
    expect(result.status).not.toBe('VERIFIED');
  });

  it('scores self-service requirement from normalized phrase variants', () => {
    const result = evaluateRequirementEvidence('self-service support', [
      'Built self service experiences for customers.',
    ]);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('marks missing Five9 evidence as UNVERIFIED', () => {
    const result = evaluateRequirementEvidence('Five9', [
      'Managed support workflows and escalation operations.',
    ], { isPlatformRequirement: true });
    expect(result.score).toBeLessThan(50);
  });

  it('does not verify Five9 from generic contact-center tooling language', () => {
    const result = evaluateRequirementEvidence(
      'Five9',
      ['Operated contact center tools and queue workflows.'],
      { isPlatformRequirement: true },
    );
    expect(result.status).not.toBe('VERIFIED');
  });

  it('produces mixed claim counts from mixed evidence inputs', () => {
    const coverage = evaluateToolCoverage(
      `
      Must have Salesforce and Five9 experience.
      Preferred: self service support.
      `,
      `
      Built customer self service experiences and managed SFDC case routing.
      `,
    );
    const verified = coverage.claims.filter((claim) => claim.status === 'VERIFIED').length;
    const inferred = coverage.claims.filter((claim) => claim.status === 'INFERRED').length;
    const unverified = coverage.claims.filter((claim) => claim.status === 'UNVERIFIED').length;
    expect(verified).toBeGreaterThanOrEqual(1);
    expect(unverified).toBeGreaterThanOrEqual(1);
    expect(verified + inferred + unverified).toBe(coverage.claims.length);
  });

  it('verifies Salesforce from experience bullet even when skills-like entries omit it', () => {
    const coverage = evaluateToolCoverage(
      'Must have Salesforce experience.',
      'Summary: customer ops leader.',
      {
        baselineSections: [
          { title: 'Skills', content: 'Zendesk, Jira' },
          { title: 'Experience', content: 'Owned escalation workflows in Salesforce Service Cloud.' },
        ],
      },
    );
    const salesforce = coverage.claims.find((claim) => claim.key === 'salesforce');
    expect(salesforce?.status).toBe('VERIFIED');
  });

  it('uses structured baseline sections to verify requirements through evaluateToolCoverage input path', () => {
    const coverage = evaluateToolCoverage(
      'Must have Salesforce experience.',
      'Generic profile summary with no tools listed.',
      {
        baselineSections: [
          {
            title: 'Experience',
            content: 'Owned case routing and admin workflows in Salesforce Service Cloud.',
          },
        ],
      },
    );
    const salesforce = coverage.claims.find((claim) => claim.key === 'salesforce');
    expect(salesforce?.status).toBe('VERIFIED');
    expect(
      salesforce?.evidenceRefs.some((ref) =>
        ref.toLowerCase().includes('salesforce service cloud'),
      ),
    ).toBe(true);
  });
});
