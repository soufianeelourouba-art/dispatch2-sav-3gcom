// Visual check of every screen, logged in as a manager and as an orienteur.
//   node scripts/screenshots.ts <output-dir> [base-url]
// Uses the locally installed Microsoft Edge through playwright-core. Creates two temporary
// accounts (deleted at the end) — run it against the dev server (`npm run dev`) or a preview URL.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium, type Page } from 'playwright-core';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import './admin.ts';

const [outDir = 'screenshots', baseUrl = 'http://localhost:3000'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const auth = getAuth();
const db = getFirestore();
// Read-only: the temporary orienteur is attached to the first existing sector; nothing else is written.
const SECTOR = (await db.collection('sectors').limit(1).get()).docs[0]?.id || 'none';

async function tempAccount(role: 'MANAGER' | 'DISPATCHER') {
  const email = `screens-${role.toLowerCase()}-${randomBytes(3).toString('hex')}@example.invalid`;
  const password = randomBytes(18).toString('base64url');
  const { uid } = await auth.createUser({ email, password });
  await db.doc(`users/${uid}`).set({
    id: uid, email, username: email, role,
    name: role === 'MANAGER' ? 'Manager Test' : 'Orienteur Test',
    sectorIds: role === 'DISPATCHER' ? [SECTOR] : [],
    sectorId: role === 'DISPATCHER' ? SECTOR : null,
  });
  return { uid, email, password };
}

const SCREENS = {
  MANAGER: [
    ['manager-dashboard', 'Vue Royaume'],
    ['referentiel', 'Référentiel'],
    ['techniciens', 'Techniciens'],
    ['import', 'Import Excel'],
  ],
  DISPATCHER: [
    ['dispatch', 'Dispatch du jour'],
    ['suivi', 'Suivi direct'],
    ['import', 'Importer Excel'],
    ['techniciens', 'Mes techniciens'],
    ['files', 'Files spéciales'],
  ],
} as const;

const errors: string[] = [];

async function login(page: Page, email: string, password: string) {
  await page.goto(baseUrl);
  await page.getByPlaceholder('prenom.nom@3gcom.ma').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  try {
    await page.locator('header').waitFor({ timeout: 20000 });
  } catch (err) {
    await page.screenshot({ path: join(outDir, 'login-failure.png') });
    throw err;
  }
  await page.waitForTimeout(1500); // let Firestore listeners fill the screen
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const accounts = { MANAGER: await tempAccount('MANAGER'), DISPATCHER: await tempAccount('DISPATCHER') };
try {
  // Login screen
  for (const [name, viewport] of [['desktop', { width: 1400, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
    const page = await browser.newPage({ viewport });
    await page.goto(baseUrl);
    await page.getByPlaceholder('prenom.nom@3gcom.ma').waitFor();
    await page.screenshot({ path: join(outDir, `00-login-${name}.png`) });
    await page.close();
  }

  for (const role of ['MANAGER', 'DISPATCHER'] as const) {
    for (const [device, viewport] of [['desktop', { width: 1400, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on('pageerror', err => errors.push(`${role}/${device}: ${err.message}`));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(`${role}/${device} console: ${msg.text()}`); });
      await login(page, accounts[role].email, accounts[role].password);
      for (const [id, label] of SCREENS[role]) {
        await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: label, exact: true }).click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(outDir, `${role === 'MANAGER' ? '1' : '2'}-${id}-${device}.png`), fullPage: device === 'desktop' });
      }
      // "Créer un ticket" dialog, opened then closed without submitting
      if (role === 'DISPATCHER') {
        await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Dispatch du jour', exact: true }).click();
        await page.getByRole('button', { name: 'Créer un ticket' }).click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(outDir, `3-creer-ticket-${device}.png`) });
        await page.getByRole('button', { name: 'Annuler' }).click();

        // Import preview of the sample file (never confirmed)
        await page.getByRole('navigation').filter({ visible: true }).getByRole('button', { name: 'Importer Excel', exact: true }).click();
        await page.getByRole('button', { name: /Charger un fichier type/ }).click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(outDir, `3-import-apercu-${device}.png`), fullPage: device === 'desktop' });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  for (const { uid } of Object.values(accounts)) {
    await Promise.all([auth.deleteUser(uid), db.doc(`users/${uid}`).delete()]);
  }
}

console.log(`Captures dans ${outDir}`);
console.log(errors.length ? `Erreurs navigateur :\n- ${[...new Set(errors)].join('\n- ')}` : 'Aucune erreur navigateur.');
