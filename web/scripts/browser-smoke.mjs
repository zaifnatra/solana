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
let activePage = page;
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

    await page.getByRole('combobox', { name: 'Genre', exact: true }).selectOption({ label: 'Jazz' });
    await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('price-high');
    await page.getByRole('article', { name: 'Blue Note', exact: true }).waitFor();
    await card().waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('article').count(), 1, 'Genre narrows the artist directory');
    assert.equal(new URL(page.url()).searchParams.get('genre'), 'Jazz');
    await page.getByRole('link', { name: 'View Blue Note', exact: true }).click();
    await page.getByRole('link', { name: '← Back to artists', exact: true }).click();
    await page.getByRole('combobox', { name: 'Genre', exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Genre', exact: true }).inputValue(), 'Jazz');
    assert.equal(await page.getByRole('combobox', { name: 'Sort by', exact: true }).inputValue(), 'price-high');
    await page.reload();
    await page.getByRole('article', { name: 'Blue Note', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').count(), 1, 'Filters survive reload');
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await card().waitFor();
    await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('name');
    await page.getByRole('article').first().getByRole('heading', { name: 'Blue Note', exact: true }).waitFor();
    assert.equal(await page.getByRole('article').first().getAttribute('aria-label'), 'Blue Note');
    await page.getByPlaceholder('Search for artists...').fill('no-matching-demo-artist');
    await page.getByRole('heading', { name: 'No artists found', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show all artists', exact: true }).click();
    await card().waitFor();

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
    await dialog().getByLabel('Tokens to buy', { exact: true }).fill('0');
    await dialog().getByText('Enter 1–10,000 whole tokens.', { exact: true }).waitFor();
    assert.equal(await dialog().getByRole('button', { name: 'Confirm buy', exact: true }).count(), 0);
    await dialog().getByLabel('Tokens to buy', { exact: true }).fill('2');
    await dialog().getByText('2 KINJI', { exact: true }).waitFor();
    await dialog().getByRole('button', { name: '10', exact: true }).click();
    await dialog().getByText('10 KINJI', { exact: true }).waitFor();
    // Selecting the current preset must not discard the quote indefinitely.
    await dialog().getByRole('button', { name: '10', exact: true }).click();
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
    await page.getByRole('region', { name: 'Portfolio performance', exact: true }).waitFor();
    await page.getByRole('region', { name: 'Kinji position', exact: true }).getByRole('button', { name: 'Sell tokens', exact: true }).click();
    await dialog().getByRole('button', { name: 'Half', exact: true }).click();
    await dialog().getByText('5 KINJI', { exact: true }).waitFor();
    await dialog().getByRole('button', { name: 'All', exact: true }).click();
    await dialog().getByText('10 KINJI', { exact: true }).waitFor();
    await dialog().getByRole('button', { name: 'Close dialog', exact: true }).click();
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
    await page.getByRole('region', { name: 'Kinji position', exact: true }).getByRole('button', { name: 'Sell tokens', exact: true }).click();
    assert.equal(await dialog().getByRole('button', { name: 'Half', exact: true }).count(), 0, 'A one-token holding has no half-sale preset');
    await dialog().getByRole('button', { name: 'All', exact: true }).click();
    await dialog().getByText('1 KINJI', { exact: true }).waitFor();
    await dialog().getByRole('button', { name: 'Close dialog', exact: true }).click();
    await navigate('Discover', '/');
    await trade('sell', 1);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigate('Me', '/profile');
    const displayName = page.getByLabel('Display name', { exact: true });
    await displayName.fill('   ');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByText('Enter your display name.', { exact: true }).waitFor();
    assert.equal(await displayName.getAttribute('aria-invalid'), 'true');
    assert.ok(await displayName.evaluate(input => document.activeElement === input), 'Focus first invalid profile field');
    assert.ok(await displayName.evaluate(input => input.form.noValidate), 'Use inline errors rather than native browser bubbles');
    await displayName.fill('Browser smoke creator');
    await page.getByLabel('About you', { exact: true }).fill('A persistent test profile.');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Profile saved.' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Browser smoke creator', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Browser smoke creator');
    const symbol = `SMK${Date.now().toString(36)}`.toUpperCase();
    await page.getByRole('button', { name: 'Create artist profile', exact: true }).click();
    await page.getByRole('button', { name: 'Continue to story', exact: true }).click();
    await page.getByText('Enter your artist name.', { exact: true }).waitFor();
    const artistName = page.getByLabel('Artist name', { exact: true });
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 3, 'Explain every invalid identity field');
    assert.ok(await artistName.evaluate(input => document.activeElement === input), 'Focus first invalid artist field');
    assert.ok(await artistName.evaluate(input => input.form.noValidate));
    await artistName.fill('Smoke Test Collective');
    await page.getByLabel('Token symbol', { exact: true }).fill(symbol);
    await page.getByLabel('Genre', { exact: true }).fill('Electronic');
    await page.getByRole('button', { name: 'Continue to story', exact: true }).click();
    const description = page.getByLabel('Short description', { exact: true });
    await page.getByLabel('Artist website (optional)', { exact: true }).fill('http://example.com');
    await page.getByRole('button', { name: 'Review artist profile', exact: true }).click();
    await page.getByText('Enter a short description of your sound.', { exact: true }).waitFor();
    await page.getByText('Use a public HTTPS link, such as https://example.com.', { exact: true }).waitFor();
    assert.ok(await description.evaluate(input => document.activeElement === input));
    await description.fill('A test-only paper artist.');
    await page.getByLabel('Artist website (optional)', { exact: true }).fill('');
    await page.getByLabel('Artist biography (optional)', { exact: true }).fill('Created by the browser regression suite.');
    await page.getByRole('button', { name: 'Review artist profile', exact: true }).click();
    await page.getByRole('button', { name: 'Edit artist identity', exact: true }).click();
    assert.equal(await artistName.inputValue(), 'Smoke Test Collective', 'Review edits preserve identity');
    await page.getByRole('button', { name: 'Continue to story', exact: true }).click();
    assert.equal(await description.inputValue(), 'A test-only paper artist.', 'Going back preserves story');
    await page.getByRole('button', { name: 'Review artist profile', exact: true }).click();
    let creatorResponseLost = false;
    await page.route('**/api/v1/artists', async route => {
        if (!creatorResponseLost && route.request().method() === 'POST') {
            creatorResponseLost = true;
            const response = await route.fetch();
            assert.equal(response.status(), 201);
            await route.abort('connectionreset');
        } else await route.continue();
    });
    await page.getByRole('button', { name: 'Create paper artist market', exact: true }).click();
    await page.getByText('We could not confirm whether your profile was created.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit artist identity', exact: true }).count(), 0, 'Do not change an unresolved creation request');
    await page.getByRole('button', { name: 'Check artist profile', exact: true }).click();
    await page.unroute('**/api/v1/artists');
    await page.getByRole('heading', { name: 'Share a release', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Publish release', exact: true }).click();
    await page.getByText('Enter a release title.', { exact: true }).waitFor();
    await page.getByText('Enter a release update.', { exact: true }).waitFor();
    const releaseTitle = page.getByLabel('Release title', { exact: true });
    assert.ok(await releaseTitle.evaluate(input => document.activeElement === input));
    assert.ok(await releaseTitle.evaluate(input => input.form.noValidate));
    await releaseTitle.fill('First demo release');
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
    activePage = follower;
    follower.on('pageerror', error => errors.push(error.message));
    await follower.goto(`${baseURL}/artists/${symbol}`);
    await follower.getByRole('button', { name: 'Follow artist', exact: true }).click();
    await follower.getByRole('button', { name: 'Start paper account', exact: true }).click();
    // The button changes to Creating account… before signup completes.
    // Wait for the whole unauthenticated panel to disappear instead.
    await follower.getByRole('heading', { name: 'Make it your collection.', exact: true }).waitFor({ state: 'hidden' });
    await follower.getByRole('button', { name: 'Follow artist', exact: true }).click();
    await follower.getByRole('button', { name: 'Following', exact: true }).waitFor();
    await navigate('Friends', '/friends', follower);
    await follower.getByRole('heading', { name: 'First demo release', exact: true }).waitFor();
    await follower.reload();
    await follower.getByRole('heading', { name: 'First demo release', exact: true }).waitFor();
    await follower.getByRole('button', { name: 'Unfollow Smoke Test Collective', exact: true }).click();
    await follower.getByRole('heading', { name: 'First demo release', exact: true }).waitFor({ state: 'hidden' });
    activePage = page;
    await followerContext.close();

    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('Browser smoke passed: validation, buy/sell, persisted holdings, responsive controls, uncertain-order recovery, profile persistence, creator registration, release publication, follow/feed isolation.');
} catch (error) {
    console.error('Browser smoke failed at:', activePage.url());
    await mkdir('test-results', { recursive: true });
    await activePage.screenshot({ path: 'test-results/browser-smoke-failure.png', fullPage: true }).catch(() => {});
    await writeFile('test-results/browser-smoke-failure.txt', await activePage.locator('body').innerText()).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
