import { supabase } from '../config/supabaseClient';

const EMAIL_POLICY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

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

export function mapLoginError(code?: string): string {
  return 'Login failed. Please try again.';
}

export function mapRegisterError(code?: string): string {
  return 'Account creation failed. Please try again.';
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

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

