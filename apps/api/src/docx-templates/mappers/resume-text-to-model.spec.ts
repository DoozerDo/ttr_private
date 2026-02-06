import { mapResumeTextToModel } from './resume-text-to-model';

describe('resume text to model mapper', () => {
  it('detects header, summary, and skills', () => {
    const sections = [
      {
        title: 'Experience',
        content: `John Candidate
Chief Product Officer
john@example.com

Senior Program Manager | Acme Corp | 2020 - 2023

- Bullet one.`,
      },
      {
        title: 'Summary',
        content: 'Summary\nLine two.',
      },
      {
        title: 'Skills',
        content: 'Automation, Strategy, Analytics',
      },
    ];

    const model = mapResumeTextToModel('', sections);
    expect(model.header.name).toBe('John Candidate');
    expect(model.summary).toContain('Summary');
    expect(model.skills?.[0]?.[0]).toBe('Automation, Strategy, Analytics');
  });

  it('parses bullets and experience headers with dates', () => {
    const sections = [
      {
        title: 'Experience',
        content: `Senior Consultant | Beta Co | 2017 - 2019
- Did task.

Project Lead | Gamma | 2014 - 2016
- Led team.`,
      },
    ];

    const model = mapResumeTextToModel('', sections);
    expect(model.experiences?.length).toBe(2);
    expect(model.experiences?.[0]?.company).toContain('Beta Co');
    expect(model.experiences?.[1]?.role).toContain('Project Lead');
  });
});
