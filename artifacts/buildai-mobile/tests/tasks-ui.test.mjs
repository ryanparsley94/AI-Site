/**
 * Browser-only UI regression checks. API/auth responses are intercepted:
 * this does not verify real sign-in, database persistence, AI, or native devices.
 * Run: node --test artifacts/buildai-mobile/tests/tasks-ui.test.mjs
 * Uses the existing web artifact's Playwright installation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(new URL('../../buildai/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const domain = process.env.REPLIT_EXPO_DEV_DOMAIN;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim();

const task = (id, title, extra = {}) => ({
  id, title, priority: 'medium', status: 'pending', source: 'manual',
  dueDate: null, createdAt: '2026-10-08T08:00:00Z', updatedAt: '2026-10-08T08:00:00Z',
  ...extra,
});

test('mobile tasks: shared endpoint actions, failures, refresh and offline cache', async () => {
  assert.ok(domain, 'REPLIT_EXPO_DEV_DOMAIN must point to the running Expo workflow');
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let tasks = [task(1, 'Confirm site access', { priority: 'high' }), task(2, 'Order fixings')];
    let nextId = 3;
    let failAdd = false;
    let failGenerate = false;
    let failList = false;
    let creates = 0;
    const requests = [];
    const handleRoute = async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      requests.push({ path, method, body: request.postDataJSON() });
      const respond = (body, status = 200) => route.fulfill({
        status, contentType: 'application/json', body: JSON.stringify(body),
        headers: {
          'access-control-allow-origin': request.headers().origin || `https://${domain}`,
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
        },
      });
      if (method === 'OPTIONS') return respond({});
      if (path === '/api/auth/check') return respond({ authenticated: true });
      if (path === '/api/tasks' && method === 'GET') {
        return failList ? respond({ error: 'Test load failure' }, 500) : respond(tasks);
      }
      if (path === '/api/tasks' && method === 'POST') {
        creates++;
        if (failAdd) return respond({ error: 'Test save failure' }, 500);
        const created = task(nextId++, request.postDataJSON().title, request.postDataJSON());
        tasks.push(created);
        return respond(created, 201);
      }
      if (/^\/api\/tasks\/\d+$/.test(path) && method === 'PATCH') {
        const updated = tasks.find(t => t.id === Number(path.split('/').at(-1)));
        Object.assign(updated, request.postDataJSON());
        return respond(updated);
      }
      if (path === '/api/tasks/generate' && method === 'POST') {
        if (failGenerate) return respond({ error: 'Test generation failure' }, 500);
        const created = task(nextId++, 'Call back client', { source: 'ai' });
        tasks.push(created);
        return respond([created], 201);
      }
      return respond({});
    };
    await context.route('**/api/**', handleRoute);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`https://${domain}/tasks`);
    const add = page.getByRole('button', { name: 'Add task', exact: true });
    const input = page.getByRole('textbox', { name: 'New task title' });
    const generate = page.getByRole('button', { name: 'Generate tasks with AI' });
    await expect(generate).toBeVisible({ timeout: 90000 });
    await expect(page.getByText('Confirm site access', { exact: true })).toBeVisible();
    await input.fill('   ');
    await expect(add).toBeDisabled();
    await input.fill('  Test manual task  ');
    await add.click();
    await expect(page.getByText('Test manual task', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    assert.deepEqual(requests.find(r => r.path === '/api/tasks' && r.method === 'POST').body,
      { title: 'Test manual task', priority: 'medium', source: 'manual' });
    assert.equal(creates, 1);
    await page.getByRole('button', { name: 'Mark complete: Test manual task', exact: true }).click();
    await page.getByRole('tab', { name: /^Done/ }).click();
    await expect(page.getByText('Test manual task', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restore to pending: Test manual task', exact: true }).click();
    await page.getByRole('tab', { name: /^To do/ }).click();
    await page.getByRole('button', { name: 'Dismiss: Test manual task', exact: true }).click();
    await page.getByRole('tab', { name: /^Dismissed/ }).click();
    await expect(page.getByText('Test manual task', { exact: true })).toBeVisible();
    assert.equal(tasks.find(t => t.title === 'Test manual task').status, 'dismissed');
    await generate.click();
    await expect(page.getByText('Added 1 AI-generated task.', { exact: true })).toBeVisible();
    await expect(page.getByText('Call back client', { exact: true })).toBeVisible();
    failAdd = true;
    await input.fill('Keep this draft');
    await add.click();
    await expect(page.getByText(/Could not save task/)).toBeVisible();
    await expect(input).toHaveValue('Keep this draft');
    failGenerate = true;
    await generate.click();
    await expect(page.getByText(/Generation failed/)).toBeVisible();
    // A server-side change becomes visible on returning to this screen.
    tasks.push(task(nextId++, 'Added on the web'));
    await page.locator('a[href="/jobs"]').click();
    await page.locator('a[href="/tasks"]').click();
    await expect(page.getByText('Added on the web', { exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      'screen must not overflow horizontally at phone width');
    await page.screenshot({ path: '/tmp/crewon-mobile-tasks-test.jpg' });
    await context.setOffline(true);
    // Expo keeps previously visited tabs mounted, so cached screens may share this banner.
    await expect(page.getByText('Offline — showing cached data').first()).toBeVisible();
    await expect(generate).toBeDisabled();
    await expect(add).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Mark complete: Confirm site access', exact: true })).toBeDisabled();
    await expect(page.getByText('Added on the web', { exact: true })).toBeVisible();
    await context.setOffline(false);
    // Chromium's offline emulation does not reliably notify NetworkInformation
    // on reconnect; signal that browser API's change event explicitly.
    await page.evaluate(() => navigator.connection?.dispatchEvent(new Event('change')));
    await expect(generate).toBeEnabled();
    tasks = [];
    await page.locator('a[href="/jobs"]').click();
    await page.locator('a[href="/tasks"]').click();
    await expect(page.getByText('Nothing on the list', { exact: true })).toBeVisible();
    // Fresh browser has no persisted cache: failed GET must show an error, not empty success.
    failList = true;
    const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await freshContext.route('**/api/**', handleRoute);
    const fresh = await freshContext.newPage();
    await fresh.goto(`https://${domain}/tasks`);
    await expect(fresh.getByText('Could not load tasks', { exact: true })).toBeVisible({ timeout: 20000 });
    failList = false;
    await fresh.getByRole('button', { name: 'Retry loading tasks' }).click();
    await expect(fresh.getByText('Nothing on the list', { exact: true })).toBeVisible();
    assert.deepEqual(errors, [], 'Tasks must not produce uncaught browser errors');
    console.log('Verified intercepted UI flows; real authenticated API/AI and native devices not tested.');
  } finally {
    await browser.close();
  }
});
