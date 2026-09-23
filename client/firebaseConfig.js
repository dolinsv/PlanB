/**
 * Firebase client config (public by design — protect data with DB rules).
 *
 * Realtime Database rules:
 * {
 *   "rules": {
 *     "planb": {
 *       ".read": true,
 *       ".write": true
 *     }
 *   }
 * }
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAsTEtT8AOEWnHd6SdSuWRB0AEGqDITPPk',
  authDomain: 'planb-53dd9.firebaseapp.com',
  databaseURL: 'https://planb-53dd9-default-rtdb.firebaseio.com',
  projectId: 'planb-53dd9',
  storageBucket: 'planb-53dd9.firebasestorage.app',
  messagingSenderId: '814482712904',
  appId: '1:814482712904:web:178b8839d5fd57a5eaeb7d',
  measurementId: 'G-X32S4TH3KC',
};

export function isRemoteSyncEnabled() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.databaseURL &&
      firebaseConfig.projectId
  );
}
