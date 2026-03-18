import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

/**
 * Firebase Configuration for AquaFeed Pro
 *
 * IMPORTANT: Replace the placeholder values below with your actual Firebase project credentials.
 * You can find these in the Firebase Console → Project Settings → General → Your apps → Web app.
 *
 * Steps:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or use an existing one)
 * 3. Enable Realtime Database (Build → Realtime Database → Create Database)
 * 4. Set database rules to allow read/write (for development):
 *    {
 *      "rules": {
 *        ".read": true,
 *        ".write": true
 *      }
 *    }
 * 5. Add a Web app (Project Settings → Add app → Web)
 * 6. Copy the config values below
 */
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export default app;
