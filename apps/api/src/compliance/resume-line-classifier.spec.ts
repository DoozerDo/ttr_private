import { classifyResumeLine, ResumeLineType } from './resume-line-classifier';

describe('classifyResumeLine', () => {
  it('classifies role headers', () => {
    expect(
      classifyResumeLine('Software Development Engineer in Test'),
    ).toBe(ResumeLineType.ROLE_HEADER);
    expect(classifyResumeLine('Operations Engineer II')).toBe(
      ResumeLineType.ROLE_HEADER,
    );
  });

  it('classifies bullet claims', () => {
    expect(
      classifyResumeLine('Led migration of the automation platform'),
    ).toBe(ResumeLineType.BULLET_CLAIM);
    expect(classifyResumeLine('Managed infrastructure across 50 labs')).toBe(
      ResumeLineType.BULLET_CLAIM,
    );
  });

  it('classifies baseline evidence fragments', () => {
    expect(classifyResumeLine('Network infrastructure deployment')).toBe(
      ResumeLineType.BULLET_EVIDENCE_FRAGMENT,
    );
    expect(classifyResumeLine('Mobile lab management')).toBe(
      ResumeLineType.BULLET_EVIDENCE_FRAGMENT,
    );
  });

  it('classifies skill stacks and noise', () => {
    expect(classifyResumeLine('Azure | Terraform | Kubernetes')).toBe(
      ResumeLineType.SKILL_STACK,
    );
    expect(classifyResumeLine('Python, Bash, PowerShell')).toBe(
      ResumeLineType.SKILL_STACK,
    );
    expect(classifyResumeLine('Professional Experience')).toBe(
      ResumeLineType.NOISE,
    );
    expect(
      classifyResumeLine('References available upon request'),
    ).toBe(ResumeLineType.NOISE);
  });
});
