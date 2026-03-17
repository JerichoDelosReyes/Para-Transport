/**
 * Firebase Admin SDK Configuration
 * 
 * Initializes Firebase Admin for:
 * - Authentication (verifying ID tokens from frontend)
 * - Firestore (preferences, achievements storage)
 * 
 * Supports both production (env var) and local development (JSON file).
 * 
 * @module config/firebase
 * @version 1.0.0
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseApp = null;
let firebaseInitialized = false;
let initSource = 'NONE';

/**
 * Initialize Firebase Admin SDK
 * Priority: ENV variable > Local JSON file
 */
function initializeFirebase() {
  if (firebaseInitialized) {
    return firebaseApp;
  }

  let serviceAccount = null;

  // Option 1: Production - Read from environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      initSource = 'ENV';
      console.log('🔥 Firebase: Using credentials from FIREBASE_SERVICE_ACCOUNT env var');
    } catch (parseError) {
      console.error('❌ Firebase: Failed to parse FIREBASE_SERVICE_ACCOUNT env var');
      console.error('   Error:', parseError.message);
      console.error('   Make sure the env var contains valid JSON');
      return null;
    }
  }

  // Option 2: Local Development - Read from JSON file
  if (!serviceAccount) {
    const localKeyPath = path.join(__dirname, 'serviceAccountKey.json');
    
    if (fs.existsSync(localKeyPath)) {
      try {
        serviceAccount = require(localKeyPath);
        initSource = 'LOCAL';
        console.log('🔥 Firebase: Using credentials from serviceAccountKey.json (local dev)');
      } catch (requireError) {
        console.error('❌ Firebase: Failed to load serviceAccountKey.json');
        console.error('   Error:', requireError.message);
        return null;
      }
    } else {
      console.warn('⚠️  Firebase: No credentials found');
      console.warn('   - Set FIREBASE_SERVICE_ACCOUNT env var for production');
      console.warn('   - Or place serviceAccountKey.json in backend/config/ for local dev');
      return null;
    }
  }

  // Initialize Firebase Admin
  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    
    firebaseInitialized = true;
    console.log(`✅ Firebase Admin initialized (source: ${initSource})`);
    console.log(`   Project: ${serviceAccount.project_id || 'unknown'}`);
    
    return firebaseApp;
  } catch (initError) {
    console.error('❌ Firebase: Failed to initialize Admin SDK');
    console.error('   Error:', initError.message);
    return null;
  }
}

// Initialize on module load
initializeFirebase();

/**
 * Get Firestore database instance
 * @returns {FirebaseFirestore.Firestore|null}
 */
function getFirestore() {
  if (!firebaseInitialized) {
    console.warn('⚠️  Firebase not initialized - Firestore unavailable');
    return null;
  }
  return admin.firestore();
}

/**
 * Get Auth instance for token verification
 * @returns {admin.auth.Auth|null}
 */
function getAuth() {
  if (!firebaseInitialized) {
    console.warn('⚠️  Firebase not initialized - Auth unavailable');
    return null;
  }
  return admin.auth();
}

/**
 * Verify Firebase ID token from frontend
 * @param {string} idToken - The ID token to verify
 * @returns {Promise<admin.auth.DecodedIdToken|null>}
 */
async function verifyIdToken(idToken) {
  const auth = getAuth();
  if (!auth) {
    return null;
  }
  
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('❌ Firebase: Token verification failed:', error.message);
    return null;
  }
}

/**
 * Check if Firebase is properly initialized
 * @returns {boolean}
 */
function isInitialized() {
  return firebaseInitialized;
}

module.exports = {
  admin,
  app: firebaseApp,
  db: getFirestore,
  auth: getAuth,
  verifyIdToken,
  isInitialized,
  initSource,
};
