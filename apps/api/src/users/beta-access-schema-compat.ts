import type { Logger } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { User } from './user.entity';

let hasLoggedMissingBetaAccessApprovedColumnWarning = false;

export function resetBetaAccessSchemaCompatForTests() {
  hasLoggedMissingBetaAccessApprovedColumnWarning = false;
}

export function isMissingBetaAccessApprovedColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('betaAccessApproved') &&
    (message.includes('does not exist') || message.includes('unknown column'))
  );
}

export function logMissingBetaAccessApprovedColumnWarningOnce(
  logger: Logger,
  operation: string,
) {
  if (hasLoggedMissingBetaAccessApprovedColumnWarning) {
    return;
  }

  hasLoggedMissingBetaAccessApprovedColumnWarning = true;
  logger.warn(
    `DB schema drift detected: missing users.betaAccessApproved (operation=${operation}). Using temporary fallback query path; apply pending migrations to restore full beta entitlement resolution.`,
  );
}

function applyBetaAccessApprovedFallback(user: User | null): User | null {
  if (user && (user as any).betaAccessApproved === undefined) {
    (user as any).betaAccessApproved = false;
  }
  return user;
}

export async function findUserByIdSchemaSafe(input: {
  repo: Repository<User>;
  logger: Logger;
  userId: string;
  operation: string;
  select: string[];
}): Promise<User | null> {
  try {
    return applyBetaAccessApprovedFallback(
      await input.repo.findOne({ where: { id: input.userId } }),
    );
  } catch (error) {
    if (!isMissingBetaAccessApprovedColumnError(error)) {
      throw error;
    }

    logMissingBetaAccessApprovedColumnWarningOnce(input.logger, input.operation);
    const user = await input.repo
      .createQueryBuilder('user')
      .select(input.select)
      .where('user.id = :id', { id: input.userId })
      .getOne();
    return applyBetaAccessApprovedFallback(user);
  }
}

export async function findUserByEmailSchemaSafe(input: {
  repo: Repository<User>;
  logger: Logger;
  email: string;
  operation: string;
  select: string[];
}): Promise<User | null> {
  try {
    return applyBetaAccessApprovedFallback(
      await input.repo.findOne({ where: { email: input.email } }),
    );
  } catch (error) {
    if (!isMissingBetaAccessApprovedColumnError(error)) {
      throw error;
    }

    logMissingBetaAccessApprovedColumnWarningOnce(input.logger, input.operation);
    const user = await input.repo
      .createQueryBuilder('user')
      .select(input.select)
      .where('user.email = :email', { email: input.email })
      .getOne();
    return applyBetaAccessApprovedFallback(user);
  }
}

