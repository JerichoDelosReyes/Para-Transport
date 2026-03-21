import { supabase } from '../config/supabaseClient';

const EMAIL_POLICY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const DEFAULT_PASSWORD_RESET_REDIRECT = 'para://reset-password';

export type SupabaseUserProfile = {
  uid: string;
  name: string;
  email: string;
  points: number;
  streak_count: number;
  trips: number;
  distance: number;
  spent: number;
  badges: string[];
  settings: {
    notificationsEnabled: boolean;
    language: string;
  };
  saved: {
    routes: string[];
    places: string[];
  };
  stats: {
    trips: number;
    distanceKm: number;
    totalFareSpent: number;
  };
  streak: {
    current: number;
    longest: number;
  };
};

export function validateRequiredFields(values: string[]): boolean {
  return values.every((value) => value.trim().length > 0);
}

export function isEmailValid(email: string): boolean {
  return EMAIL_POLICY.test(email.trim());
}

export function isPasswordStrong(password: string): boolean {
  return PASSWORD_POLICY.test(password);
}

export function passwordValidationMessage(password: string): string {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!isPasswordStrong(password)) {
    return 'Use uppercase, lowercase, number, and special character.';
  }
  return '';
}

export function mapLoginError(error?: string): string {
  if (error && error.toLowerCase().includes('credential')) return 'Invalid email or password.';
  if (error && error.toLowerCase().includes('email')) return 'Please check your email address.';
  return error || 'Login failed. Please try again.';
}

export function mapRegisterError(error?: string): string {
  if (error && error.toLowerCase().includes('already registered')) return 'This email is already registered.';
  return error || 'Account creation failed. Please try again.';
}

export function mapResetPasswordError(error?: string): string {
  const normalized = (error || '').toLowerCase();
  if (normalized.includes('email') && normalized.includes('invalid')) {
    return 'Please enter a valid email address.';
  }
  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many') ||
    normalized.includes('max_frequency') ||
    normalized.includes('over_email_send_rate_limit')
  ) {
    return 'Too many reset attempts. Please wait a bit and try again.';
  }
  return error || 'Could not send reset email. Please try again.';
}

export async function loginWithEmailPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function registerWithEmailPassword(params: {
  displayName: string;
  email: string;
  password: string;
}) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        display_name: params.displayName,
      }
    }
  });
  if (error) throw error;
  return data;
}

export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function sendPasswordResetEmail(email: string, redirectTo?: string) {
  const resolvedRedirect = redirectTo || DEFAULT_PASSWORD_RESET_REDIRECT;
  const options = { redirectTo: resolvedRedirect };
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, options);
  if (error) throw error;
  return data;
}

export async function updatePassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

