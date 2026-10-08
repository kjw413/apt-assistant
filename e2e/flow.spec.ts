import { test, expect } from '@playwright/test';
import { APP_URL, launch } from './helpers';

test('드릴 종료 → 정답 입력 → 결과(시간 내/전체) → 백업 다운로드', async () => {
  const { ctx, page } = await launch('flow-grade');
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('drill');
  await page.getByLabel('영역').selectOption({ label: '언어논리' });
  await page.getByLabel('문항 수').fill('3');
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByTestId('bubble-0-1').click();
  await page.getByTestId('bubble-1-2').click();
  await page.getByTestId('bubble-2-4').click();
  await page.getByRole('button', { name: '종료' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
  await page.getByLabel('정답').fill('123');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '채점 저장' }).click();
  expect((await download).suggestedFilename()).toMatch(/^apt-backup-\d{8}-\d{4}\.json$/);
  await expect(page.getByTestId('score-total')).toHaveText('2/3');
  await expect(page.getByTestId('score-inlimit')).toHaveText('2/3');
  await ctx.close();
});

test('외부 모의: 쉬는 시간 없이 시작, 영역 카드, 종료 뒤 요약', async () => {
  const { ctx, page } = await launch('flow-external');
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('external');
  await page.getByLabel('외부 모의 이름').fill('합격시대 DCAT 2회');
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByTestId('external-card')).toContainText('1–20번');
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '종료' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
    if (i < 4) await page.getByRole('button', { name: '시작', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: '확인' })).toBeVisible();
  await ctx.close();
});

test('프로필 조정: 시간 바꾸면 요약이 바뀌고, 교재 기본값으로 복원', async () => {
  const { ctx, page } = await launch('flow-profile');
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByRole('button', { name: '조정' }).click();
  await page.getByLabel('언어논리 시간').fill('18:00');
  await page.getByLabel('쉬는 시간(초)').fill('30');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByTestId('times-summary')).toHaveText('18:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 30초');
  await page.getByRole('button', { name: '조정' }).click();
  await page.getByRole('button', { name: '교재 기본값으로' }).click();
  await expect(page.getByTestId('times-summary')).toHaveText('20:00 · 10:00 · 20:00 · 7:30 · 7:30 / 쉬는 시간 15초');
  await ctx.close();
});
