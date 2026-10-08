import { chromium, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_URL = pathToFileURL(path.resolve('dist/index.html')).href;

export async function launch(
  name: string,
  opts: { fresh?: boolean; viewport?: { width: number; height: number } } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const dir = path.resolve('e2e/.profile-test', name);
  if (opts.fresh !== false) fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chrome',
    headless: true,
    acceptDownloads: true,
    viewport: opts.viewport ?? { width: 460, height: 900 },
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}
