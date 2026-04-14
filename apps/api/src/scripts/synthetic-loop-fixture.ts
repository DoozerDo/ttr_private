import { createHash } from 'node:crypto';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { SyntheticGenerationFixtureBundle } from '../synthetic/generation/synthetic-generation.types';

export const SYNTHETIC_LOOP_BASELINE_FILENAME = 'baseline-v23.docx';
export const SYNTHETIC_LOOP_BASELINE_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function buildParagraph(text: string, options?: { bold?: boolean }) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: options?.bold ?? false,
      }),
    ],
  });
}

function buildHeading(text: string) {
  return buildParagraph(text, { bold: true });
}

function buildBullet(text: string) {
  return buildParagraph(`- ${text}`);
}

export async function loadSyntheticLoopBaselineFixture(
  bundle: SyntheticGenerationFixtureBundle,
  runId?: string,
) {
  if (!bundle.benchmark) {
    throw new Error(`Synthetic generation fixture bundle ${bundle.scenario.id} is missing benchmark data.`);
  }
  const sections = [
    buildParagraph('Morgan Lee'),
    buildHeading('Summary'),
    buildParagraph(
      'Support Operations Director with ownership of queue health, service delivery, escalation governance, staffing tradeoffs, and weekly operating rhythm for a SaaS team.',
    ),
    buildParagraph(
      'Partnered with product, engineering, cloud infrastructure, and customer support on incident response, routing, and service quality improvements.',
    ),
    buildHeading('Experience'),
    buildParagraph('Example SaaS | Support Operations Director | 2019 - 2022'),
    buildBullet(
      'Owned support workflow design and queue health for a SaaS team.',
    ),
    buildBullet(
      'Built dashboards and KPI reporting for executive reviews and staffing decisions.',
    ),
    buildBullet(
      'Kept staffing and SLA trends visible for support leaders.',
    ),
    buildBullet(
      'Coached managers on escalation handling and customer communication.',
    ),
    buildParagraph('Workflow And Incident Design Lead | Example SaaS | Seattle, WA'),
    buildParagraph('2022 - 2024'),
    buildBullet(
      'Partnered with cloud teams on incident response and service reliability.',
    ),
    buildBullet(
      'Standardized Zendesk, Jira, and Salesforce Service Cloud reporting and tooling governance.',
    ),
    buildBullet(
      'Drove change coordination, problem management, and recurring issue follow-up.',
    ),
    buildBullet(
      'Created runbooks and process notes that tightened handoffs during active incidents.',
    ),
    buildParagraph('Example SaaS | Support Operations Program Owner | 2024 - Present'),
    buildBullet(
      'Led operating reviews, coaching rhythms, and escalation playbooks.',
    ),
    buildBullet(
      'Led cross functional prioritization on recurring issue fixes.',
    ),
    buildBullet(
      'Improved automation workflows and ITSM process maturity.',
    ),
    buildBullet(
      'Used voice of the customer, CSAT trends, and self service signals to guide change leadership.',
    ),
    buildBullet(
      'Owned capacity planning and staffing tradeoffs across two regions and three queues.',
    ),
    buildBullet(
      'Reduced repeat escalations, improved SLA adherence, and lowered response time.',
    ),
    buildBullet(
      'Kept issue analysis and service metrics aligned with the operating rhythm.',
    ),
    buildBullet(
      'Built operating reviews and playbooks that clarified ownership.',
    ),
    buildBullet(
      'Aligned support tooling, reporting, and team workflows to the operating model.',
    ),
    buildBullet(
      'Maintained leadership visibility into customer advocacy and service quality.',
    ),
    buildHeading('Technical Skills'),
    buildParagraph('Zendesk | Jira | Salesforce Service Cloud | SQL | Looker'),
    buildParagraph('Queue health | capacity planning | staffing tradeoffs | weekly operating reviews | voice of the customer | customer advocacy | CSAT | self service'),
  ];

  const document = new Document({
    sections: [
      {
        children: sections,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  return {
    buffer,
    filename: SYNTHETIC_LOOP_BASELINE_FILENAME,
    mimetype: SYNTHETIC_LOOP_BASELINE_MIME_TYPE,
    contentHash,
  };
}
