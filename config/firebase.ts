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
  apiKey: "AIzaSyCtDFFhoUeggflsweDPtNnZCRk3_pBKOd4",
  authDomain: "iotfeeder-57d4b.firebaseapp.com",
  databaseURL: "https://iotfeeder-57d4b-default-rtdb.firebaseio.com",
  projectId: "iotfeeder-57d4b",
  storageBucket: "iotfeeder-57d4b.firebasestorage.app",
  messagingSenderId: "580931369227",
  appId: "1:580931369227:web:9a12ff01ef7404a66a8a0e",
  measurementId: "G-Z670FVQPWV"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export default app;
