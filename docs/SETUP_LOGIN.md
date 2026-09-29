# Turning on Google / Apple sign-in and cross-device sync

The app already saves every game (box score + play-by-play) on the device you play on. Sign-in adds a private
cloud copy so your Mac and iPhone show the same games and stats. It uses Firebase (free "Spark" plan is plenty).
Only you can create the project, because sign-in providers are tied to accounts you own.

## 1. Create the Firebase project (5 min)
1. Go to https://console.firebase.google.com → **Add project** (any name; Analytics not needed).
2. **Build → Firestore Database → Create database** (production mode, any region).
3. In Firestore → **Rules**, paste the contents of `firestore.rules` from this repo and **Publish**.
4. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` object.
5. Paste it into `web/js/config.js`:
   ```js
   export const FIREBASE_CONFIG = { apiKey: '…', authDomain: 'your-project.firebaseapp.com', projectId: 'your-project', appId: '…' };
   ```
   (These values are not secret; the Firestore rules are what protect your data.)

## 2. Allow your website address
**Build → Authentication → Settings → Authorized domains → Add domain**:
`erichsu0227.github.io` (and `localhost`, already there, for testing on your Mac).

## 3. Google sign-in
**Authentication → Sign-in method → Google → Enable** → choose a support email → Save. Done.

## 4. Apple sign-in (needs a paid Apple Developer account, $99/yr)
1. https://developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers → + → App IDs**, create one
   with **Sign in with Apple** enabled (any bundle id, e.g. `com.yourname.diamondsim`).
2. **Identifiers → + → Services IDs** → create (e.g. `com.yourname.diamondsim.web`), enable **Sign in with Apple →
   Configure**: Primary App ID = the one above; **Domains**: `your-project.firebaseapp.com`;
   **Return URLs**: `https://your-project.firebaseapp.com/__/auth/handler`.
3. **Keys → +** → enable **Sign in with Apple** → download the `.p8` key; note the **Key ID** and your **Team ID**.
4. Firebase → **Authentication → Sign-in method → Apple → Enable**: Services ID, Team ID, Key ID, and the `.p8`
   contents as the private key → Save.

## 5. Publish
Commit `web/js/config.js`, merge to `main` (GitHub Pages redeploys). Open the app → **Stats & logs** → sign in.

### Notes
* Without this setup nothing breaks — the app is local-only and the account card explains how to enable sync.
* On iPhone, sign-in pop-ups can be blocked inside the installed Home Screen app; the app then falls back to a
  full-page redirect. If it still refuses, sign in once in Safari, then reopen the Home Screen app.
* Deleting a save on one device does not delete it from the cloud copy (sync only adds and updates).
