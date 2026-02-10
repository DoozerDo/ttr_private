import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';

async function main() {
  const args = process.argv.slice(2);
  const assessmentId = args[0];

  if (!assessmentId) {
    console.error('Usage: print-assessment-debug <assessmentId>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const dataSource = app.get(DataSource);
    const repository = dataSource.getRepository(FitAssessment);
    const assessment = await repository.findOne({
      where: { id: assessmentId },
    });

    if (!assessment) {
      console.error(`Assessment ${assessmentId} not found`);
      process.exit(1);
    }

    if (!assessment.scoringV2 || !assessment.scoringV2.debug) {
      console.error(`Assessment ${assessmentId} missing scoring_v2 debug data`);
      process.exit(1);
    }

    const debug = assessment.scoringV2.debug;
    const bundle = debug.bundle;
    if (!bundle) {
      console.error(`Assessment ${assessmentId} missing scoring_v2 debug.bundle`);
      process.exit(1);
    }

    const normalizedBaseline = bundle.inputs.normalizedBaseline;
    const normalizedJob = bundle.inputs.normalizedJob;
    const output = {
      assessmentId: assessment.id,
      jobId: assessment.jobId ?? null,
      baselineId: assessment.baselineId ?? null,
      baselineVersion: assessment.baselineVersion ?? null,
      overallScore: assessment.overallScore,
      scoring_v2: {
        score: assessment.scoringV2.score,
        debug: {
          baselineCoveragePercent: debug.baselineCoveragePercent,
          baselineCoverageDetails: debug.baselineCoverageDetails ?? null,
          bundle: {
            inputs: {
              normalizedBaseline: {
                totalChars: normalizedBaseline.totalChars,
                coverageDetails: normalizedBaseline.coverageDetails,
                sections: normalizedBaseline.sections,
                preview: normalizedBaseline.preview,
              },
              normalizedJob: {
                charCount: normalizedJob.charCount,
                preview: normalizedJob.preview,
                normalizedResponsibilitiesCount: normalizedJob.normalizedResponsibilitiesCount,
                normalizedRequirementsCount: normalizedJob.normalizedRequirementsCount,
              },
            },
          },
        },
      },
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
