// Admin access for local scripts, using the Firebase CLI login (`firebase login`) as credentials.
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

export { firebaseConfig };

// Public OAuth client of the Firebase CLI (same values as in firebase-tools' source).
const FIREBASE_CLI_CLIENT = {
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
};

const cliConfig = JSON.parse(
  readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8')
);
// Firestore Admin only accepts application-default credentials: expose the CLI login
// as a short-lived ADC file, removed when the script ends.
const adcDir = mkdtempSync(join(tmpdir(), 'dispatch-adc-'));
const adcFile = join(adcDir, 'adc.json');
writeFileSync(adcFile, JSON.stringify({
  type: 'authorized_user',
  ...FIREBASE_CLI_CLIENT,
  refresh_token: cliConfig.tokens.refresh_token,
  quota_project_id: firebaseConfig.projectId,
}));
process.env.GOOGLE_APPLICATION_CREDENTIALS = adcFile;
process.on('exit', () => rmSync(adcDir, { recursive: true, force: true }));
export const adminApp = initializeApp({ credential: applicationDefault(), projectId: firebaseConfig.projectId });

