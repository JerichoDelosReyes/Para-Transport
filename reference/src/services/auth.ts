/**
 * Firebase Authentication Service
 * 
 * Handles phone-based authentication for Philippine numbers (+63).
 * Uses Firebase Auth with OTP verification.
 * 
 * @module services/auth
 */

import { 
  ConfirmationResult, 
  signInWithPhoneNumber as firebaseSignInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from 'firebase/auth';
import { auth } from '../config/firebase';

// =============================================================================
// Types
// =============================================================================

/**
 * User data structure
 */
export interface AuthUser {
  uid: string;
  phoneNumber: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  createdAt: Date | null;
}

/**
 * Phone number validation result
 */
export interface PhoneValidationResult {
  isValid: boolean;
  formattedNumber: string | null;
  error: string | null;
}

/**
 * Auth operation result
 */
export interface AuthResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Confirmation result from Firebase Web SDK
 */
export type PhoneConfirmationResult = ConfirmationResult;

// =============================================================================
// Constants
// =============================================================================

/**
 * Philippine country code
 */
export const PH_COUNTRY_CODE = '+63';

/**
 * Expected phone number length (excluding country code)
 */
export const PH_PHONE_LENGTH = 10;

/**
 * OTP code length
 */
export const OTP_LENGTH = 6;

// =============================================================================
// Phone Number Utilities
// =============================================================================

/**
 * Validate Philippine phone number format
 * 
 * Rules:
 * - Must start with 9 (mobile prefix)
 * - Must be exactly 10 digits (excluding +63)
 * - Only numeric characters allowed
 * 
 * @param phoneNumber - Phone number without country code
 * @returns Validation result with formatted number
 * 
 * @example
 * ```ts
 * validatePhoneNumber('9171234567') // Valid
 * validatePhoneNumber('09171234567') // Valid (strips leading 0)
 * validatePhoneNumber('1234567890') // Invalid (doesn't start with 9)
 * ```
 */
export const validatePhoneNumber = (phoneNumber: string): PhoneValidationResult => {
  // Remove all non-numeric characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // Remove leading 0 if present (common PH format)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove country code if accidentally included
  if (cleaned.startsWith('63')) {
    cleaned = cleaned.substring(2);
  }
  
  // Check if empty
  if (!cleaned) {
    return {
      isValid: false,
      formattedNumber: null,
      error: 'Please enter your phone number',
    };
  }
  
  // Check if starts with 9 (PH mobile prefix)
  if (!cleaned.startsWith('9')) {
    return {
      isValid: false,
      formattedNumber: null,
      error: 'Philippine mobile numbers must start with 9',
    };
  }
  
  // Check length
  if (cleaned.length !== PH_PHONE_LENGTH) {
    return {
      isValid: false,
      formattedNumber: null,
      error: `Phone number must be ${PH_PHONE_LENGTH} digits (e.g., 9171234567)`,
    };
  }
  
  // Format with country code
  const formattedNumber = `${PH_COUNTRY_CODE}${cleaned}`;
  
  return {
    isValid: true,
    formattedNumber,
    error: null,
  };
};

/**
 * Format phone number for display
 * 
 * @param phoneNumber - Full phone number with country code
 * @returns Formatted display string
 */
export const formatPhoneDisplay = (phoneNumber: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.length === 12 && cleaned.startsWith('63')) {
    // Format: +63 917 123 4567
    return `+63 ${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
  }
  
  return phoneNumber;
};

/**
 * Validate OTP code format
 * 
 * @param code - OTP code string
 * @returns True if valid 6-digit code
 */
export const validateOTPCode = (code: string): boolean => {
  const cleaned = code.replace(/\D/g, '');
  return cleaned.length === OTP_LENGTH;
};

// =============================================================================
// Firebase Auth Service
// =============================================================================

/**
 * Send OTP to phone number
 * 
 * Initiates phone authentication by sending SMS verification code.
 * 
 * @param phoneNumber - Phone number WITHOUT country code (e.g., "9171234567")
 * @returns Confirmation result for OTP verification
 */
export const signInWithPhoneNumber = async (
  phoneNumber: string
): Promise<AuthResult<PhoneConfirmationResult>> => {
  try {
    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber);
    
    if (!validation.isValid || !validation.formattedNumber) {
      return {
        success: false,
        error: validation.error || 'Invalid phone number',
      };
    }
    
    console.log('[auth] Sending OTP to:', validation.formattedNumber);
    
    // [PLACEHOLDER] - Firebase Phone Auth

    // TODO: Ensure Firebase is properly configured in the Expo project
    // Requires: firebase.json, GoogleService-Info.plist, google-services.json

    
    // NOTE: Web Phone Auth requires a RecaptchaVerifier instance.
    // In Expo Go without a browser view, true phone auth verification via Web SDK is not natively supported out of the box. 
    // This function will fail unless a global RecaptchaVerifier object is provided to `applicationVerifier`
    // Standard approach for this migration: we assume window.recaptchaVerifier is set up elsewhere in the UI.
    const applicationVerifier = (window as any).recaptchaVerifier;
    
    if (!applicationVerifier) {
      console.warn('[auth] WARNING: No RecaptchaVerifier found. Phone auth will likely fail in this environment.');
    }
    
    const confirmation = await firebaseSignInWithPhoneNumber(auth, validation.formattedNumber, applicationVerifier);
    
    return {
      success: true,
      data: confirmation,
    };
  } catch (error: any) {
    console.error('[auth] signInWithPhoneNumber error:', error);
    
    // Map Firebase errors to user-friendly messages
    const errorMessage = mapFirebaseError(error.code);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Verify OTP code
 * 
 * Confirms the SMS verification code to complete authentication.
 * 
 * @param confirmationResult - Result from signInWithPhoneNumber
 * @param code - 6-digit OTP code
 * @returns Auth result with user data
 */
export const confirmCode = async (
  confirmationResult: PhoneConfirmationResult,
  code: string
): Promise<AuthResult<AuthUser>> => {
  try {
    // Validate OTP format
    if (!validateOTPCode(code)) {
      return {
        success: false,
        error: 'Please enter a valid 6-digit code',
      };
    }
    
    const cleanedCode = code.replace(/\D/g, '');
    
    console.log('[auth] Verifying OTP code');
    
    // Confirm the code with Firebase
    const userCredential = await confirmationResult.confirm(cleanedCode);
    
    if (!userCredential.user) {
      return {
        success: false,
        error: 'Verification failed. Please try again.',
      };
    }
    
    // Map to our user type
    const user: AuthUser = {
      uid: userCredential.user.uid,
      phoneNumber: userCredential.user.phoneNumber,
      displayName: userCredential.user.displayName,
      isAnonymous: userCredential.user.isAnonymous,
      createdAt: userCredential.user.metadata.creationTime 
        ? new Date(userCredential.user.metadata.creationTime) 
        : null,
    };
    
    console.log('[auth] User authenticated:', user.uid);
    
    return {
      success: true,
      data: user,
    };
  } catch (error: any) {
    console.error('[auth] confirmCode error:', error);
    
    const errorMessage = mapFirebaseError(error.code);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Sign out current user
 */
export const signOut = async (): Promise<AuthResult> => {
  try {
    await firebaseSignOut(auth);
    console.log('[auth] User signed out');
    
    return { success: true };
  } catch (error: any) {
    console.error('[auth] signOut error:', error);
    
    return {
      success: false,
      error: 'Failed to sign out. Please try again.',
    };
  }
};

/**
 * Get current authenticated user
 */
export const getCurrentUser = (): AuthUser | null => {
  const firebaseUser = auth.currentUser;
  
  if (!firebaseUser) {
    return null;
  }
  
  return {
    uid: firebaseUser.uid,
    phoneNumber: firebaseUser.phoneNumber,
    displayName: firebaseUser.displayName,
    isAnonymous: firebaseUser.isAnonymous,
    createdAt: firebaseUser.metadata.creationTime 
      ? new Date(firebaseUser.metadata.creationTime) 
      : null,
  };
};

/**
 * Subscribe to auth state changes
 * 
 * @param callback - Function called when auth state changes
 * @returns Unsubscribe function
 */
export const onAuthStateChanged = (
  callback: (user: AuthUser | null) => void
): (() => void) => {
  return firebaseOnAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      callback({
        uid: firebaseUser.uid,
        phoneNumber: firebaseUser.phoneNumber,
        displayName: firebaseUser.displayName,
        isAnonymous: firebaseUser.isAnonymous,
        createdAt: firebaseUser.metadata.creationTime 
          ? new Date(firebaseUser.metadata.creationTime) 
          : null,
      });
    } else {
      callback(null);
    }
  });
};

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Map Firebase error codes to user-friendly messages
 */
const mapFirebaseError = (errorCode: string): string => {
  const errorMessages: Record<string, string> = {
    'auth/invalid-phone-number': 'The phone number format is invalid. Please check and try again.',
    'auth/missing-phone-number': 'Please enter your phone number.',
    'auth/quota-exceeded': 'Too many requests. Please try again later.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/operation-not-allowed': 'Phone authentication is not enabled. Please contact support.',
    'auth/invalid-verification-code': 'Invalid verification code. Please check and try again.',
    'auth/invalid-verification-id': 'Verification session expired. Please request a new code.',
    'auth/code-expired': 'The verification code has expired. Please request a new one.',
    'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',
    'auth/network-request-failed': 'Network error. Please check your connection and try again.',
    'auth/captcha-check-failed': 'Security verification failed. Please try again.',
    'auth/missing-verification-code': 'Please enter the verification code.',
    'auth/missing-verification-id': 'Session error. Please request a new code.',
  };
  
  return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
};

// =============================================================================
// Export Default
// =============================================================================

export default {
  validatePhoneNumber,
  formatPhoneDisplay,
  validateOTPCode,
  signInWithPhoneNumber,
  confirmCode,
  signOut,
  getCurrentUser,
  onAuthStateChanged,
  PH_COUNTRY_CODE,
  PH_PHONE_LENGTH,
  OTP_LENGTH,
};
