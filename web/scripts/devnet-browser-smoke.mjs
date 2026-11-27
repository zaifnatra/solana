// Mocked-chain browser checks. No wallet secrets, network transactions, or funding.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fixture, rpcResponse } from '../tests/devnet-fixtures.mjs';

const baseURL = process.env.MTL_TEST_URL || 'http://127.0.0.1:18081';
const output = process.env.MTL_QA_OUTPUT || 'test-results/devnet';
const browser = await chromium.launch({ headless: true, ...(process.env.MTL_BROWSER_EXECUTABLE ? { executablePath: process.env.MTL_BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const state = fixture();
const errors = [];
let wrongNetwork = false;
let missingManifest = false;
let sends = 0;
const methods = new Set();
await context.route('**/devnet-markets.json', async route => {
  await route.fulfill({ status: missingManifest ? 404 : 200, contentType: 'application/json', body: missingManifest ? '{}' : JSON.stringify(state.raw) });
});
await context.route('https://api.devnet.solana.com/**', async route => {
  const request = route.request().postDataJSON();
  methods.add(request.method);
  if (request.method === 'sendTransaction') sends++;
  const result = wrongNetwork && request.method === 'getGenesisHash' ? 'wrong-network' : await rpcResponse(request.method, request.params, state);
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(15000);
try {
  await mkdir(output, { recursive: true });
  await page.goto(`${baseURL}/devnet`);
  await page.getByRole('heading', { name: 'Fixture artist', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'Browsing does not request a wallet');
  assert.equal(await page.locator('.app-header').count(), 1, 'Exactly one header');
  assert.equal(await page.locator('.bottom-navbar').count(), 1, 'Exactly one navbar');
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: false });
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal overflow');
    await page.getByRole('button', { name: 'Buy', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Connect wallet to trade', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: /Sign buy/ }).count(), 0);
    await page.screenshot({ path: `${output}/connect-${width}.png`, fullPage: false });
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: false });
  wrongNetwork = true;
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Wrong Solana network' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Buy', exact: true }).count(), 0);
  wrongNetwork = false; missingManifest = true;
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Devnet markets have not been configured' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Buy', exact: true }).count(), 0);
  assert.equal(sends, 0, 'No transaction submitted by these browser checks');
  assert.deepEqual(errors, [], 'No browser exceptions');
  console.log(JSON.stringify({ pass: true, mode: 'mocked-devnet-rpc', widths: [375, 1440], rpcMethods: [...methods], transactionsSubmitted: sends, output }));
} finally { await browser.close(); }
