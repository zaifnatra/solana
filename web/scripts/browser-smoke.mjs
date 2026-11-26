// Run only against a disposable paper service. Creates accounts and places paper trades.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.MTL_TEST_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(15000);
context.setDefaultNavigationTimeout(30000);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const card = () => page.getByRole('article', { name: 'Kinji', exact: true });
const dialog = () => page.getByRole('dialog');
async function navigate(name, path, target = page) {
    await target.getByRole('link', { name, exact: true }).click();
    await target.waitForURL(url => url.pathname === path);
}
async function trade(side, quantity) {
    await card().getByRole('spinbutton').fill(String(quantity));
    await card().getByRole('button', { name: side === 'buy' ? 'Buy' : 'Sell', exact: true }).click();
    await dialog().getByRole('button', { name: `Confirm ${side}`, exact: true }).click();
    await dialog().getByRole('status').filter({ hasText: `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} KINJI tokens.` }).waitFor();
    await dialog().getByRole('button', { name: 'Done', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
}
try {
    await page.goto(baseURL);
    await card().waitFor();
    await page.getByPlaceholder('Search for artists...').fill(' KINJI ');
    await page.getByRole('article', { name: 'Kaytranada', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('article').count(), 1, 'Search trims whitespace');
    await page.getByPlaceholder('Search for artists...').fill('');

    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click();
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await dialog().getByRole('heading', { name: 'How MTL works', exact: true }).waitFor();
    await dialog().getByRole('button', { name: 'Close dialog', exact: true }).press('Escape');
    await dialog().waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click();
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await page.waitForURL('**/profile');
    await navigate('Discover', '/');

    for (const amount of ['0', '-5', '1.5', '']) {
        await card().getByRole('spinbutton').fill(amount);
        await card().getByRole('button', { name: 'Buy', exact: true }).click();
        await card().getByRole('alert').filter({ hasText: 'Enter 1–10,000 whole tokens.' }).waitFor();
        assert.equal(await page.getByRole('dialog').count(), 0, 'Invalid order must not reach confirmation');
    }
    await card().getByRole('spinbutton').fill('10');
    await card().getByRole('button', { name: 'Buy', exact: true }).click();
    await dialog().getByRole('button', { name: 'Start paper account', exact: true }).click();
    await dialog().getByRole('button', { name: 'Confirm buy', exact: true }).click();
    await dialog().getByRole('status').filter({ hasText: 'Bought 10 KINJI tokens.' }).waitFor();
    await dialog().getByRole('button', { name: 'Done', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await navigate('Wallet', '/my-tokens');
    await page.getByRole('article', { name: 'Kinji', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('article', { name: 'Kinji', exact: true }).waitFor();
    await card().getByText(/^10\s*TOKENS$/).waitFor();
    assert.match(await card().innerText(), /10\s*TOKENS/);
    await navigate('Discover', '/');
    await trade('sell', 10);

    // Check clipping geometrically, not just scrollWidth (the old UI hid overflow).
    for (const width of [320, 375, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const bounds = await card().evaluate(el => {
            const outer = el.getBoundingClientRect();
            return { outer: outer.toJSON(), buttons: [...el.querySelectorAll('.trade-actions > button')].map(button => button.getBoundingClientRect().toJSON()) };
        });
        assert.equal(bounds.buttons.length, 2, 'Both trade buttons are measured');
        for (const button of bounds.buttons) {
            assert.ok(button.left >= bounds.outer.left - 1 && button.right <= bounds.outer.right + 1, `Trade button clipped at ${width}px`);
        }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    // Commit on server, deliberately lose the response, then reload and retrieve it.
    let lost = false;
    await page.route('**/api/v1/orders', async route => {
        if (!lost && route.request().method() === 'POST') {
            lost = true;
            const committed = await route.fetch();
            assert.equal(committed.status(), 200);
            await route.abort('connectionreset');
        } else await route.continue();
    });
    await card().getByRole('spinbutton').fill('1');
    await card().getByRole('button', { name: 'Buy', exact: true }).click();
    await dialog().getByRole('button', { name: 'Confirm buy', exact: true }).click();
    await dialog().getByText('Order status is unknown.', { exact: false }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Check order', exact: true }).click();
    await dialog().getByRole('button', { name: 'Check order result', exact: true }).click();
    await dialog().getByRole('status').filter({ hasText: 'Bought 1 KINJI tokens.' }).waitFor();
    await dialog().getByRole('button', { name: 'Done', exact: true }).click();
    await dialog().waitFor({ state: 'hidden' });
    await navigate('Wallet', '/my-tokens');
    await page.getByRole('article', { name: 'Kinji', exact: true }).waitFor();
    await card().getByText(/^1\s*TOKENS$/).waitFor();
    assert.match(await card().innerText(), /1\s*TOKENS/);
    await navigate('Discover', '/');
    await trade('sell', 1);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigate('Me', '/profile');
    await page.getByLabel('Display name', { exact: true }).fill('Browser smoke creator');
    await page.getByLabel('About you', { exact: true }).fill('A persistent test profile.');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Profile saved.' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Browser smoke creator', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Browser smoke creator');
    const symbol = `SMK${Date.now().toString(36)}`.toUpperCase();
    await page.getByRole('button', { name: 'Create artist profile', exact: true }).click();
    await page.getByLabel('Artist name', { exact: true }).fill('Smoke Test Collective');
    await page.getByLabel('Token symbol', { exact: true }).fill(symbol);
    await page.getByLabel('Genre', { exact: true }).fill('Electronic');
    await page.getByLabel('Short description', { exact: true }).fill('A test-only paper artist.');
    await page.getByLabel('Artist biography', { exact: true }).fill('Created by the browser regression suite.');
    await page.getByRole('button', { name: 'Create paper artist market', exact: true }).click();
    await page.getByRole('heading', { name: 'Share a release', exact: true }).waitFor();
    await page.getByLabel('Release title', { exact: true }).fill('First demo release');
    await page.getByLabel('Release update', { exact: true }).fill('A real persisted update, with no external audio fixture.');
    await page.getByRole('button', { name: 'Publish release', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Release published.' }).waitFor();
    await page.getByRole('link', { name: 'View Smoke Test Collective →', exact: true }).click();
    await page.getByRole('heading', { name: 'First demo release', exact: true }).waitFor();

    // A separate browser account follows this artist and sees the creator's update.
    const followerContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    followerContext.setDefaultTimeout(15000);
    followerContext.setDefaultNavigationTimeout(30000);
    const follower = await followerContext.newPage();
    follower.on('pageerror', error => errors.push(error.message));
    await follower.goto(`${baseURL}/artists/${symbol}`);
    await follower.getByRole('button', { name: 'Follow artist', exact: true }).click();
    await follower.getByRole('button', { name: 'Start paper account', exact: true }).click();
    await follower.getByRole('button', { name: 'Start paper account', exact: true }).waitFor({ state: 'hidden' });
    await follower.getByRole('button', { name: 'Follow artist', exact: true }).click();
    await follower.getByRole('button', { name: 'Following', exact: true }).waitFor();
    await navigate('Friends', '/friends', follower);
    await follower.getByRole('heading', { name: 'First demo release', exact: true }).waitFor();
    await follower.reload();
    await follower.getByRole('heading', { name: 'First demo release', exact: true }).waitFor();
    await follower.getByRole('button', { name: 'Unfollow Smoke Test Collective', exact: true }).click();
    await follower.getByRole('heading', { name: 'First demo release', exact: true }).waitFor({ state: 'hidden' });
    await followerContext.close();

    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('Browser smoke passed: validation, buy/sell, persisted holdings, responsive controls, uncertain-order recovery, profile persistence, creator registration, release publication, follow/feed isolation.');
} catch (error) {
    console.error('Browser smoke failed at:', page.url());
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/browser-smoke-failure.png', fullPage: true }).catch(() => {});
    await writeFile('test-results/browser-smoke-failure.txt', await page.locator('body').innerText()).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
