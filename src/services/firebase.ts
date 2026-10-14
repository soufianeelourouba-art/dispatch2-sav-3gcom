import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with specific databaseId if provided
export const db = initializeFirestore(
  app,
  {},
  firebaseConfig.firestoreDatabaseId || '(default)'
);

// Connection test invariant
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('✅ Connexion Firestore Cloud établie avec succès.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('⚠️ Firestore mode hors-ligne ou configuration à vérifier.');
    } else {
      console.log('ℹ️ Firestore connecté :', error);
    }
    return false;
  }
}
