// Visual check of the technician app on a phone screen, with the API mocked (nothing is written):
//   node scripts/screenshots-tech.ts <output-dir> [base-url]
// Needs the dev server (npm run dev).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [outDir = 'screenshots-tech', baseUrl = 'http://localhost:3000'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const ticket = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `t${n}`, ticketNumber: `R34586136${n}`, clientName: ['MLY ALI EL ALAMI', 'FATIMA BENNANI', 'SAID KHALIL'][n - 1],
  clientNumber: 'N/A', clientPhone: '212522525236/212666274849', clientAddress: 'CASA AIN CHOK HAY HASSANI, Lotissement Salmane n°6',
  rawZoneText: 'CALIFORNIE', currentStatus: 'ASSIGNED', ...extra,
});
const fixture = {
  technician: { fullName: 'Soufiane' },
  suspended: false,
  tickets: [ticket(1), ticket(2, { splitterRef: 'GA-C-HADDAOUIA-2:1-1-12-8' }), ticket(3, { splitterRef: 'GA-C-HADDAOUIA-2:1-1-12-8' })],
  toDeclare: [ticket(1, { currentStatus: 'COMPLETED', closedAt: new Date().toISOString() })],
  declared: [ticket(2, {
    currentStatus: 'COMPLETED',
    prestation: { code: 'FO_01_02', raccordements: 2, materials: { joints: 1, splitters: 0, cableMeters: 40 }, declaredAt: new Date().toISOString(), declaredBy: 'Soufiane', photoCount: 1 },
  })],
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/portal**', route =>
  route.request().method() === 'GET'
    ? route.fulfill({ json: fixture })
    : route.fulfill({ json: { ticketNumbers: ['R345861361'], leadTicketId: 't1', status: 'COMPLETED' } })
);
const shot = (name: string, fullPage = false) => page.screenshot({ path: join(outDir, `${name}.png`), fullPage });

await page.goto(`${baseUrl}/?act=act_demo123456`);
await page.getByText('À faire').first().waitFor();
await shot('1-a-faire');

await page.getByRole('button', { name: 'NF', exact: true }).first().click();
await page.getByRole('button', { name: '⚙️ NF config centrale' }).click();
await page.getByRole('button', { name: '01-02 FO' }).click();
await page.getByRole('button', { name: 'Oui, j\'ai posé du matériel' }).click();
await page.getByRole('button', { name: 'Plus', exact: true }).first().click();
// Viewport screenshots while scrolling (full-page captures misplace sticky/fixed bars)
await page.evaluate(() => window.scrollTo(0, 0));
await shot('2a-formulaire-haut');
await page.getByText('Matériel installé').scrollIntoViewIfNeeded();
await shot('2b-formulaire-materiel');

await page.getByRole('button', { name: 'Valider la NF' }).click();
await page.waitForTimeout(400);
await shot('3-erreurs');

await page.getByRole('button', { name: 'Retour' }).click();
await page.getByRole('button', { name: /À déclarer/ }).click();
await shot('4-a-declarer');
await page.getByRole('button', { name: /Déclarées/ }).click();
await shot('5-mes-prestations');

await browser.close();
console.log(errors.length ? `Erreurs : ${errors.join(' | ')}` : 'Aucune erreur navigateur.');
