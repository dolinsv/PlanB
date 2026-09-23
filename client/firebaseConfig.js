/**
 * Firebase Realtime Database config (client keys are public by design).
 * Create a free project: https://console.firebase.google.com/
 * Enable Realtime Database → start in test mode (or rules below).
 *
 * Rules (for a private couple planner):
 * {
 *   "rules": {
 *     "planb": {
 *       ".read": true,
 *       ".write": true
 *     }
 *   }
 * }
 *
 * Fill in values, then run: npm run deploy
 */
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export function isRemoteSyncEnabled() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.databaseURL &&
      firebaseConfig.projectId
  );
}
