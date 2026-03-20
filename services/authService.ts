import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, getFirebaseAuth } from '../config/firebaseConfig';

const EMAIL_POLICY = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export type FirebaseUserProfile = {
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
  switch (code) {
    case 'auth/email-not-verified':
      return 'Two-factor email sent. Verify your email before logging in.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/user-not-found':
      return 'Account not found.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return 'Login failed. Please try again.';
  }
}

export function mapRegisterError(code?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Please use a stronger password.';
    default:
      return 'Account creation failed. Please try again.';
  }
}

function buildDefaultProfile(user: User): Omit<FirebaseUserProfile, 'uid'> {
  const name = user.displayName || user.email?.split('@')[0] || 'Commuter';

  return {
    name,
    email: user.email || '',
    points: 0,
    streak_count: 0,
    trips: 0,
    distance: 0,
    spent: 0,
    badges: [],
    settings: {
      notificationsEnabled: true,
      language: 'en',
    },
    saved: {
      routes: [],
      places: [],
    },
    stats: {
      trips: 0,
      distanceKm: 0,
      totalFareSpent: 0,
    },
    streak: {
      current: 0,
      longest: 0,
    },
  };
}

export async function ensureUserDocument(user: User) {
  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);

  if (existing.exists()) {
    return;
  }

  const profile = buildDefaultProfile(user);

  await setDoc(userRef, {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getUserProfile(user: User): Promise<FirebaseUserProfile> {
  await ensureUserDocument(user);

  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);
  const data = (snapshot.data() || {}) as Partial<FirebaseUserProfile>;

  return {
    uid: user.uid,
    name: data.name || user.displayName || user.email?.split('@')[0] || 'Commuter',
    email: data.email || user.email || '',
    points: typeof data.points === 'number' ? data.points : 0,
    streak_count: typeof data.streak_count === 'number' ? data.streak_count : 0,
    trips: typeof data.trips === 'number' ? data.trips : 0,
    distance: typeof data.distance === 'number' ? data.distance : 0,
    spent: typeof data.spent === 'number' ? data.spent : 0,
    badges: Array.isArray(data.badges) ? data.badges : [],
    settings: {
      notificationsEnabled: data.settings?.notificationsEnabled ?? true,
      language: data.settings?.language || 'en',
    },
    saved: {
      routes: Array.isArray(data.saved?.routes) ? data.saved.routes : [],
      places: Array.isArray(data.saved?.places) ? data.saved.places : [],
    },
    stats: {
      trips: typeof data.stats?.trips === 'number' ? data.stats.trips : 0,
      distanceKm: typeof data.stats?.distanceKm === 'number' ? data.stats.distanceKm : 0,
      totalFareSpent: typeof data.stats?.totalFareSpent === 'number' ? data.stats.totalFareSpent : 0,
    },
    streak: {
      current: typeof data.streak?.current === 'number' ? data.streak.current : 0,
      longest: typeof data.streak?.longest === 'number' ? data.streak.longest : 0,
    },
  };
}

export async function loginWithEmailPassword(email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

  await credential.user.reload();
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user);
    await signOut(auth);
    const verificationError = new Error('Two-factor verification email sent. Verify your email before logging in.') as Error & {
      code?: string;
    };
    verificationError.code = 'auth/email-not-verified';
    throw verificationError;
  }

  await ensureUserDocument(credential.user);
  return credential;
}

export async function resendLoginVerificationEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  await credential.user.reload();

  if (credential.user.emailVerified) {
    await signOut(auth);
    return { alreadyVerified: true };
  }

  await sendEmailVerification(credential.user);
  await signOut(auth);
  return { alreadyVerified: false };
}

export async function registerWithEmailPassword(params: {
  displayName: string;
  email: string;
  password: string;
}) {
  const auth = getFirebaseAuth();
  const displayName = params.displayName.trim();
  const email = params.email.trim();

  const credential = await createUserWithEmailAndPassword(auth, email, params.password);
  await updateProfile(credential.user, { displayName });
  await ensureUserDocument(credential.user);
  await sendEmailVerification(credential.user);
  await signOut(auth);

  return { credential };
}
