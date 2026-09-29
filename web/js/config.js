// Cloud login + sync configuration (Firebase web config; these values are public identifiers, not secrets —
// your Firestore security rules are what protect the data). Setup steps: docs/SETUP_LOGIN.md
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD4XWyvZOJhDiYVs2byV_bt0SnhJpaQJvw',
  authDomain: 'mlb-simulator.firebaseapp.com',
  projectId: 'mlb-simulator',
  storageBucket: 'mlb-simulator.firebasestorage.app',
  messagingSenderId: '611515882575',
  appId: '1:611515882575:web:c5373c9622578278cb1e3a',
};

// The "Sign in with Apple" button needs a paid Apple Developer account plus extra Firebase setup.
// Leave false to show Google only; set true after enabling Apple in Firebase (docs/SETUP_LOGIN.md, step 4).
export const ENABLE_APPLE = false;
