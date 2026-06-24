import { supabase } from '../supabase/client';

export class AccountRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountRecoveryError';
  }
}

export function normalizeRecoveryEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function requestRecoveryEmailLink(email: string) {
  if (!supabase) {
    throw new AccountRecoveryError('Supabase client is not configured.');
  }

  const normalizedEmail = normalizeRecoveryEmail(email);

  if (!normalizedEmail) {
    throw new AccountRecoveryError('Recovery email is required.');
  }

  const { data, error } = await supabase.auth.updateUser({
    email: normalizedEmail,
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function verifyRecoveryEmailOtp({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  if (!supabase) {
    throw new AccountRecoveryError('Supabase client is not configured.');
  }

  const normalizedEmail = normalizeRecoveryEmail(email);
  const normalizedToken = token.trim();

  if (!normalizedEmail || !normalizedToken) {
    throw new AccountRecoveryError('Recovery email and code are required.');
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'email_change',
  });

  if (error) {
    throw error;
  }

  return data.session;
}
