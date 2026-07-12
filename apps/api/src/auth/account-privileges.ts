import { isFounderEmail } from './founder-access';

export type AccountPrivileges = {
  isFounder: boolean;
  isAdmin: boolean;
  isPrivileged: boolean;
};

export async function resolveAccountPrivileges(options: {
  email?: string | null;
  userId?: string | null;
  founderEmailsRaw?: string | null;
  isAdminUser?: (userId: string) => Promise<boolean> | boolean;
}): Promise<AccountPrivileges> {
  const isFounder = isFounderEmail(
    options.email,
    options.founderEmailsRaw,
  );

  if (isFounder) {
    return {
      isFounder: true,
      isAdmin: false,
      isPrivileged: true,
    };
  }

  const normalizedUserId = options.userId?.trim() ?? '';
  const isAdmin =
    Boolean(normalizedUserId) && typeof options.isAdminUser === 'function'
      ? Boolean(await options.isAdminUser(normalizedUserId))
      : false;

  return {
    isFounder: false,
    isAdmin,
    isPrivileged: isAdmin,
  };
}
