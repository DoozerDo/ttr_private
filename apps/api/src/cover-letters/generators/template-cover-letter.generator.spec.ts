import {
  BaselineIncludePolicy,
  BaselineSectionType,
} from '../../baseline/baseline-section.entity';
import { TemplateCoverLetterGenerator } from './template-cover-letter.generator';

describe('TemplateCoverLetterGenerator', () => {
  const generator = new TemplateCoverLetterGenerator();

  const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

  it('generates deterministic cover letter content from allowed baseline blocks', () => {
    const result = generator.generate({
      baselineId: 'baseline-1',
      jobId: 'job-1',
      tone: 'calm',
      job: {
        id: 'job-1',
        title: 'Product Manager',
        company: 'ExampleCorp',
        responsibilities: ['Define product strategy', 'Drive roadmap'],
        requirements: ['Align product planning with customer needs'],
      },
      allowedBaselineBlocks: [
        {
          id: 'block-1',
          title: 'Experience',
          content: 'Managed product launches across teams and coordinated stakeholder updates',
          includePolicy: BaselineIncludePolicy.OPTIONAL,
          order: 0,
          sectionType: BaselineSectionType.EXPERIENCE,
        },
      ],
    });

    expect(result.content).toMatchInlineSnapshot(`
      "I am writing to express my interest in the Product Manager role at ExampleCorp. I appreciate the chance to present a concise and candid overview of my background, focusing only on information that is already documented in a calm manner. The baseline materials I provided outline my verified experience, and I will rely on those details as I address the responsibilities of the role. I will mirror the priorities listed in the job description and keep every statement anchored to that verified record.

      Key points from my background include Managed product launches across teams and coordinated stakeholder updates. I communicate in a calm voice The enclosed baseline content also captures how I plan work, collaborate with partners, and document progress without overextending claims. These experiences relate to priorities such as Define product strategy and Drive roadmap. Each excerpt comes directly from the approved baseline so the narrative stays factual and consistent.

      I will ground my approach in the practices and outcomes already recorded, such as Managed product launches across teams and coordinated stakeholder updates. For responsibilities like Define product strategy and Drive roadmap, I will reference the documented work above, confirm expectations early, and avoid overstating experience when a requirement extends beyond that record. At ExampleCorp, I will collaborate closely to ensure every commitment is backed by evidence from my baseline. Where a requirement extends beyond the baseline, I will flag it early, seek clarity, and adjust plans so that delivery remains honest and dependable. My plan is straightforward: clarify scope, pair each priority with the most relevant baseline evidence, outline checkpoints, and document decisions so that expectations stay aligned.

      Thank you for considering how my documented background can serve ExampleCorp. I look forward to the possibility of discussing the Product Manager role further and sharing more in the same calm style. I am prepared to share any additional excerpts from my baseline to keep our conversation precise and verifiable. Please let me know a convenient time to connect, and I will prepare a brief walkthrough of the most relevant baseline highlights."
    `);
    expect(result.wordCount).toBe(countWords(result.content));
  });

  it('omits disallowed baseline text when filtered before generation', () => {
    const allowedBaselineBlock = {
      id: 'allowed-1',
      title: 'Projects',
      content: 'Documented integration of third-party APIs without storing credentials',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 1,
      sectionType: BaselineSectionType.PROJECT,
    };
    const disallowedContent =
      'Sensitive beta feature roadmap details that should stay out of the cover letter';

    const result = generator.generate({
      baselineId: 'baseline-2',
      jobId: 'job-2',
      job: {
        id: 'job-2',
        title: 'Integration Engineer',
        company: null,
        responsibilities: ['Maintain API reliability'],
        requirements: ['Audit integration risks'],
      },
      allowedBaselineBlocks: [allowedBaselineBlock],
    });

    expect(result.content).toContain(allowedBaselineBlock.content);
    expect(result.content).not.toContain(disallowedContent);
  });
});
