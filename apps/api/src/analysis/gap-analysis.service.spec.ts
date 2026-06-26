import { GapAnalysisService } from './gap-analysis.service';

describe('GapAnalysisService', () => {
  const service = new GapAnalysisService();

  it('excludes salary and compensation text from gap signals', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and coaching programs.' }],
      jobRequirements: [
        'Compensation range is $120,000 - $150,000 base salary.',
        'Own incident management and escalation operations.',
      ],
      jobResponsibilities: ['Bonus and equity details available for this role.'],
    });

    const allEvidence = result.criticalGaps
      .map((gap) => `${gap.title} ${gap.requirementEvidence}`.toLowerCase())
      .join(' ');
    expect(allEvidence).not.toContain('salary');
    expect(allEvidence).not.toContain('compensation');
    expect(allEvidence).not.toContain('bonus');
  });

  it('truncates very long baseline evidence to display-safe length', () => {
    const oversizedEvidence =
      'Platform governance playbook '.repeat(25) +
      'with cross-functional operating rhythm and verification checkpoints.';

    const result = service.analyze({
      baselineSections: [{ content: oversizedEvidence }],
      jobRequirements: ['Build platform governance for cross-functional support teams.'],
      jobResponsibilities: ['Own long-range planning for support tooling.'],
    });

    for (const gap of result.criticalGaps) {
      if (gap.baselineEvidence) {
        expect(gap.baselineEvidence.length).toBeLessThanOrEqual(180);
      }
    }
  });

  it('deduplicates repeated requirement evidence blocks', () => {
    const repeated = 'Lead incident command during high-severity outages.';
    const result = service.analyze({
      baselineSections: [{ content: 'Managed daily support queue operations.' }],
      jobRequirements: [repeated, repeated],
      jobResponsibilities: [repeated],
    });

    const matching = result.criticalGaps.filter((gap) =>
      gap.requirementEvidence.toLowerCase().includes('incident command'),
    );
    expect(matching.length).toBeLessThanOrEqual(1);
  });

  it('deprioritizes generic company-footprint boilerplate in critical gaps', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led customer escalations and coaching programs.' }],
      jobRequirements: [
        'Company has global offices across 40 countries.',
        'Own executive incident review and operational governance.',
      ],
      jobResponsibilities: ['Lead weekly executive operational reviews.'],
    });

    const topGap = result.criticalGaps[0];
    expect((topGap?.requirementEvidence ?? '').toLowerCase()).not.toContain('global offices');
  });

  it('excludes legal, EEO, accommodation, and application-process boilerplate from gaps and interview risks', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and executive incident reviews.' }],
      jobRequirements: [
        'We are an equal opportunity employer and consider all qualified applicants without regard to protected characteristics.',
        'If you require reasonable accommodation during the application process, contact recruiting.',
        'Own executive incident review and operational governance.',
      ],
      jobResponsibilities: [
        'Background check required for employment.',
        'Lead weekly executive operational reviews.',
      ],
    });

    const flattened = [
      ...result.strengths,
      ...result.criticalGaps.map((gap) => `${gap.title} ${gap.requirementEvidence}`),
      ...result.recommendedActions,
      ...result.interviewRisks.map(
        (risk) => `${risk.topic} ${risk.whyTheyMayChallengeYou} ${risk.howToAddressIt}`,
      ),
    ]
      .join(' ')
      .toLowerCase();

    expect(flattened).not.toContain('equal opportunity');
    expect(flattened).not.toContain('all qualified applicants');
    expect(flattened).not.toContain('reasonable accommodation');
    expect(flattened).not.toContain('application process');
    expect(flattened).not.toContain('background check');
    expect(flattened).toContain('executive incident review');
  });

  it('returns baseline evidence snippets as strengths instead of taxonomy labels', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Led global support operations at SentinelOne.\nBuilt escalation and incident management workflows.\nDrove cross-functional CX systems.',
        },
      ],
      jobRequirements: [
        'Lead global support operations for enterprise customers.',
        'Build escalation and incident management workflows.',
        'Direct firmware engineering experience.',
      ],
      jobResponsibilities: ['Drive cross-functional CX systems.'],
    });

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.strengths.every((value) => /SentinelOne|escalation|cross-functional/i.test(value))).toBe(
      true,
    );
    expect(result.strengths).not.toContain('Tooling and Platform Experience');
    expect(result.strengths).not.toContain('Support Operations and Process Rigor');
  });

  it('does not surface credited people leadership and strategy evidence as critical gaps', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Senior Customer Operations leader overseeing people leadership, workforce planning, executive partnership, organizational strategy, customer advocacy, and governance across global teams.\nOwned operating rhythm design, service delivery, customer enablement, and cross-functional leadership for enterprise customers.\nLed managers, coached leaders, and drove transformation across SaaS teams.',
        },
      ],
      validatedRequirements: [
        'People leadership for global teams',
        'Organizational strategy and executive partnership',
        'Customer advocacy and customer enablement',
      ],
      debugMatching: true,
    });

    expect(result.criticalGaps).toHaveLength(0);
    expect(result.recommendedActions).toHaveLength(0);
    expect(result.debug?.gapTraces.every((trace) => trace.finalDecision === 'matched')).toBe(true);
    expect(
      result.debug?.gapTraces.every((trace) => trace.suppressionReason === 'matched_requirement'),
    ).toBe(true);
  });

  it('still emits gaps when evidence is genuinely missing', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Senior Customer Operations leader overseeing people leadership, workforce planning, executive partnership, organizational strategy, customer advocacy, and governance across global teams.',
        },
      ],
      validatedRequirements: ['Direct firmware engineering experience in pre-silicon environments'],
      debugMatching: true,
    });

    const gapTitles = result.criticalGaps.map((gap) => gap.title.toLowerCase());
    expect(gapTitles).toContain('direct firmware engineering experience');
    expect(result.recommendedActions.join(' ').toLowerCase()).toContain('direct firmware engineering experience');
  });

  it('returns requirement-derived gap titles instead of taxonomy labels', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and customer escalations.' }],
      jobRequirements: [
        'Direct firmware engineering experience in pre-silicon environments.',
        'Embedded systems development exposure.',
      ],
      jobResponsibilities: [],
    });

    const gapTitles = result.criticalGaps.map((gap) => gap.title);
    expect(gapTitles).toContain('Direct firmware engineering experience');
    expect(gapTitles).toContain('Embedded systems development exposure.');
    expect(gapTitles).not.toContain('Tooling and Platform Experience');
    expect(gapTitles).not.toContain('Domain and Business Context');
  });

  it('filters requirement fragments and modifier-only phrases out of gap signals', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led customer support operations and escalation reviews.' }],
      jobRequirements: [
        'Proficient',
        'OR Equivalent Experience',
        'Strong ability',
        'Direct firmware engineering experience',
      ],
      jobResponsibilities: ['Embedded systems development exposure.'],
    });

    const flattened = [
      ...result.criticalGaps.map((gap) => `${gap.title} ${gap.requirementEvidence}`),
      ...result.recommendedActions,
      ...result.positioningSuggestions,
    ]
      .join(' ')
      .toLowerCase();

    expect(flattened).not.toContain('proficient');
    expect(flattened).not.toContain('equivalent experience');
    expect(flattened).not.toContain('strong ability');
    expect(flattened).toContain('direct firmware engineering experience');
    expect(flattened).toContain('embedded systems development exposure');
  });

  it('rejects buzzword-only baseline lines and keeps strengths evidence-based', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Leadership, team building, and innovation evangelism.\nLed customer operations and escalation programs.\nPartnered with engineering teams to operate complex systems.',
        },
      ],
      jobRequirements: [
        'Led customer operations and escalation programs.',
        'Partnered with engineering teams to operate complex systems.',
      ],
      jobResponsibilities: [],
    });

    expect(result.strengths).toContain('Led customer operations and escalation programs.');
    expect(result.strengths).toContain(
      'Partnered with engineering teams to operate complex systems.',
    );
    expect(result.strengths).not.toContain('Leadership, team building, and innovation evangelism.');
  });

  it('builds positioning suggestions from clean gap signals instead of keyword clusters', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and incident reviews.' }],
      jobRequirements: ['Direct firmware engineering experience in pre-silicon environments.'],
      jobResponsibilities: [],
    });

    expect(result.positioningSuggestions.length).toBeGreaterThan(0);
    expect(result.positioningSuggestions[0]?.toLowerCase()).toContain(
      'direct firmware engineering experience',
    );
    expect(result.positioningSuggestions.join(' ').toLowerCase()).not.toContain('proficient');
    expect(result.positioningSuggestions.join(' ').toLowerCase()).not.toContain(
      'equivalent experience',
    );
  });

  it('keeps strength evidence readable and trimmed at sentence boundaries', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Developed/deployed numerous proprietary automation workflows across support systems. Additional fragment that should not display.',
        },
      ],
      jobRequirements: ['Develop proprietary automation workflows across support systems.'],
      jobResponsibilities: [],
    });

    expect(result.strengths[0]).toBe(
      'Developed/deployed numerous proprietary automation workflows across support systems.',
    );
    expect(result.strengths[0]).not.toContain('Additional fragment');
  });

  it('filters structural job description language from gaps', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and workflow design.' }],
      jobRequirements: [
        'This Position Will Be Open For applications through May.',
        'We are looking for a candidate who can lead embedded systems development.',
        'Embedded systems development experience.',
      ],
      jobResponsibilities: ['Role will be part of the platform team.'],
    });

    const flattened = result.criticalGaps
      .map((gap) => `${gap.title} ${gap.requirementEvidence}`)
      .join(' ')
      .toLowerCase();

    expect(flattened).not.toContain('this position will be open for');
    expect(flattened).not.toContain('we are looking for');
    expect(flattened).not.toContain('role will be');
    expect(flattened).toContain('embedded systems development');
  });

  it('drops location metadata and malformed fragments from gap candidates', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Built gameplay systems and shipped player experiences.' }],
      jobRequirements: [
        'Middletown, CT',
        'Entry-level movement/dv experience designer',
        'Proficient',
        'Lead gameplay systems for live service games.',
      ],
      jobResponsibilities: ['Own gameplay tuning and rapid iteration.'],
    });

    const flattened = [
      ...result.criticalGaps.map((gap) => `${gap.title} ${gap.requirementEvidence}`),
      ...result.recommendedActions,
      ...result.positioningSuggestions,
      ...result.interviewRisks.map((risk) => `${risk.topic} ${risk.whyTheyMayChallengeYou}`),
    ]
      .join(' ')
      .toLowerCase();

    expect(flattened).not.toContain('middletown, ct');
    expect(flattened).not.toContain('entry-level movement/dv experience designer');
    expect(flattened).not.toContain('proficient');
    expect(flattened).toContain('lead gameplay systems for live service games');
  });

  it('uses validated requirements as the only downstream source of truth', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Built gameplay systems and shipped player experiences.' }],
      validatedRequirements: [
        'Lead gameplay systems for live service games.',
        'The HPC/AI team is on a mission to build the',
        'Demonstrates some knowledge of data — knows what data is',
      ],
      jobRequirements: [
        'The HPC/AI team is on a mission to build the',
        'Demonstrates some knowledge of data — knows what data is',
      ],
      jobResponsibilities: [
        'The HPC/AI team is on a mission to build the',
      ],
    });

    const flattened = [
      ...result.criticalGaps.map((gap) => `${gap.title} ${gap.requirementEvidence}`),
      ...result.recommendedActions,
      ...result.positioningSuggestions,
      ...result.interviewRisks.map((risk) => `${risk.topic} ${risk.whyTheyMayChallengeYou}`),
      ...result.strengths,
    ]
      .join(' ')
      .toLowerCase();

    expect(flattened).toContain('lead gameplay systems for live service games');
    expect(flattened).not.toContain('the hpc/ai team is on a mission to build the');
    expect(flattened).not.toContain('demonstrates some knowledge of data');
  });

  it('prefers specialized-role relevant fit rationale over generic software evidence', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Engineered network automation and datacenter operations for BGP-driven environments. Owned routing reliability for production infrastructure.',
        },
      ],
      jobRequirements: [
        'Lead network engineering for enterprise routing and infrastructure.',
        'Own incident response for network outages.',
      ],
      jobResponsibilities: [
        'Design and maintain network infrastructure for production systems.',
      ],
    });

    const joined = result.strengths.join(' ').toLowerCase();
    expect(joined).not.toContain('portfolio');
    expect(joined).not.toContain('website');
  });

  it('does not promote generic portfolio bullets as top fit rationale for network roles', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Designed and developed a custom portfolio website tailored to a non-technical client.',
        },
      ],
      jobRequirements: [
        'Lead network engineering for enterprise routing and infrastructure.',
        'Own incident response for network outages.',
      ],
      jobResponsibilities: [
        'Design and maintain network infrastructure for production systems.',
      ],
    });

    const joined = result.strengths.join(' ').toLowerCase();
    expect(joined).not.toContain('portfolio website');
    expect(joined).not.toContain('non-technical client');
  });

  it('selects up to three unique strength signals when available', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content: [
            'Led customer operations and escalation programs.',
            'Built operational workflows across support teams.',
            'Partnered with engineering teams to operate complex systems.',
            'Led customer operations and escalation programs.',
            'Directed incident response and service delivery for enterprise infrastructure.',
            'Owned network operations and routing reliability for production services.',
            'Maintained BGP routing, VLAN segmentation, and datacenter switch operations.',
          ].join('\n'),
        },
      ],
      jobRequirements: [
        'Lead customer operations and escalation programs.',
        'Build operational workflows across support teams.',
        'Partner with engineering teams to operate complex systems.',
        'Direct incident response and service delivery for enterprise infrastructure.',
        'Own network operations and routing reliability for production services.',
        'Maintain BGP routing, VLAN segmentation, and datacenter switch operations.',
      ],
      jobResponsibilities: [],
    });

    expect(result.strengths).toHaveLength(3);
    expect(new Set(result.strengths).size).toBe(3);
  });

  it('normalizes gap titles to sentence case while preserving acronyms', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and workflow design.' }],
      jobRequirements: ['PROFICIENT IN EMBEDDED RUST RTOS SDK ENVIRONMENTS'],
      jobResponsibilities: [],
    });

    expect(result.criticalGaps[0]?.title).toBe('Experience with embedded Rust RTOS SDK environments');
  });

  it('removes generic section-header nouns from gap candidates', () => {
    const result = service.analyze({
      baselineSections: [{ content: 'Led support operations and workflow design.' }],
      jobRequirements: ['Qualifications', 'Skills', 'Requirements', 'Candidate'],
      jobResponsibilities: ['Embedded systems development experience.'],
    });

    const gapTitles = result.criticalGaps.map((gap) => gap.title.toLowerCase());
    expect(gapTitles).not.toContain('qualifications');
    expect(gapTitles).not.toContain('skills');
    expect(gapTitles).not.toContain('requirements');
    expect(gapTitles).not.toContain('candidate');
    expect(gapTitles.some((title) => title.includes('embedded systems development'))).toBe(true);
  });

  it('returns a matching debug trace for obvious support scope signals', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'Led incident management and escalation workflows across enterprise support teams while owning scope governance.',
        },
      ],
      jobRequirements: ['Own incident management and scope governance.'],
      jobResponsibilities: [],
      debugMatching: true,
    });

    expect(result.debug?.enabled).toBe(true);
    expect(
      result.debug?.baselineSignalTrace.some((entry) =>
        entry.normalizedText.includes('incident management'),
      ),
    ).toBe(true);
    expect(
      result.debug?.requirementTrace.some((entry) =>
        entry.normalizedText.includes('incident management'),
      ),
    ).toBe(true);

    const trace = result.debug?.gapTraces.find((entry) =>
      entry.sourceRequirementText.toLowerCase().includes('incident management'),
    );
    expect(trace).toEqual(
      expect.objectContaining({
        gapLabel: expect.any(String),
        finalDecision: expect.stringMatching(/gap|matched|weak_match/),
      }),
    );
  });

  it('does not emit matched incident management and scope requirements as gaps', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'organizational_scale: Led support ops at enterprise scale (teamSize=50+, customerCount=10000+, isEstimate=true)\nSenior Director of Customer Operations who led incident management, service delivery, escalation governance, and service reliability.\nOwned ITSM process maturity, automation and workflow design, runbooks, dashboards, and KPIs while directing global coverage.\nManaged managers across contact center ops, chaired governance forums, and reported to the executive committee for SaaS and enterprise IT customers.',
        },
      ],
      jobRequirements: [
        'Own incident management and scope governance.',
        'Lead incident management and scope across enterprise teams.',
      ],
      jobResponsibilities: [],
      debugMatching: true,
    });

    const gapTitles = result.criticalGaps.map((gap) => gap.title.toLowerCase());
    expect(gapTitles).not.toContain('incident management and scope governance.');
    expect(gapTitles).not.toContain('incident management and scope');
    expect(
      result.debug?.gapTraces.some(
        (trace) =>
          trace.sourceRequirementText.toLowerCase().includes('incident management') &&
          trace.finalDecision === 'matched',
      ),
    ).toBe(true);
  });

  it('keeps weak matches eligible for gaps when they are not promoted to strengths', () => {
    const weakAssessment = {
      title: 'Direct automation and workflow design',
      requirementEvidence: 'Direct automation and workflow design for dashboards.',
      baselineEvidence:
        'Owned ITSM process maturity, automation and workflow design, runbooks, dashboards, and KPIs while directing global coverage.',
      evidenceScore: 0.4,
      relevanceScore: 0.44,
      severity: 0.18,
      importance: 0.7,
      reasoning: 'mocked',
      finalDecision: 'weak_match',
    };

    expect((service as any).selectStrengthSignals([weakAssessment], 3)).toEqual([]);
  });

  it('prevents the incident management and scope benchmark from surfacing as gaps when it is matched', () => {
    const result = service.analyze({
      baselineSections: [
        {
          content:
            'organizational_scale: Led support ops at enterprise scale (teamSize=50+, customerCount=10000+, isEstimate=true)\nSenior Director of Customer Operations who led incident management, service delivery, escalation governance, and service reliability.\nOwned ITSM process maturity, automation and workflow design, runbooks, dashboards, and KPIs while directing global coverage.\nManaged managers across contact center ops, chaired governance forums, and reported to the executive committee for SaaS and enterprise IT customers.',
        },
      ],
      jobRequirements: [
        'Own incident management and scope governance.',
        'Lead incident management and scope across enterprise teams.',
      ],
      jobResponsibilities: [],
      debugMatching: true,
    });

    const titles = result.criticalGaps.map((gap) => gap.title.toLowerCase());
    expect(titles).not.toContain('incident management and scope governance.');
    expect(titles).not.toContain('incident management and scope');
  });
});

