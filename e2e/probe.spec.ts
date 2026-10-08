import { test, expect } from '@playwright/test';
import { APP_URL, launch } from './helpers';

test('file:// 영속성 프로브: 재시작 뒤 IndexedDB 카운터가 이어진다', async () => {
  let { ctx, page } = await launch('probe');
  await page.goto(APP_URL + '?probe');
  await expect(page.getByTestId('probe-count')).toHaveText('1');
  const info = (await page.getByTestId('probe-info').textContent()) ?? '';
  expect(info).toContain('secure=true');
  expect(info).toContain('locks=true');
  await ctx.close();

  ({ ctx, page } = await launch('probe', { fresh: false }));
  await page.goto(APP_URL + '?probe');
  await expect(page.getByTestId('probe-count')).toHaveText('2');
  await ctx.close();
});
