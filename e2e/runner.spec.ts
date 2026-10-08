import { test, expect, type Page } from '@playwright/test';
import { APP_URL, launch } from './helpers';

async function startDrill(page: Page, opts: { section: string; count: number }) {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('drill');
  await page.getByLabel('영역').selectOption({ label: opts.section });
  await page.getByLabel('문항 수').fill(String(opts.count));
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();   // 쉬는 시간 화면(연습은 수동)
}

test('답 3개 → 새로고침 → 유지, 더블클릭해도 답 유지', async () => {
  const { ctx, page } = await launch('runner-reload');
  await startDrill(page, { section: '수리자료분석', count: 5 });
  await page.getByTestId('bubble-0-3').click();
  await page.getByTestId('bubble-1-1').dblclick();
  await page.getByTestId('bubble-2-5').click();
  await page.reload();
  await expect(page.getByTestId('bubble-0-3')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bubble-1-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bubble-2-5')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('section-clock')).toBeVisible();
  await ctx.close();
});

test('키 라우팅: 메모 → 계산기 클릭 → 숫자는 계산기, 버블 뒤 Enter·Space·숫자는 답을 바꾸지 않음', async () => {
  const { ctx, page } = await launch('runner-keys');
  await startDrill(page, { section: '수리자료분석', count: 5 });
  await page.getByTestId('memo').click();
  await page.keyboard.type('abc');
  await page.getByTestId('calc-key-7').click();
  await page.keyboard.press('8');
  await expect(page.getByTestId('calc-display')).toHaveText('78');
  await expect(page.getByTestId('memo')).toHaveValue('abc');
  await page.getByTestId('bubble-0-2').click();
  await page.keyboard.press('Enter');
  await page.keyboard.press(' ');
  await page.keyboard.press('4');
  await expect(page.getByTestId('bubble-0-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bubble-0-4')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('calc-key-C').click();
  await page.keyboard.type('0.1+0.2=');
  await expect(page.getByTestId('calc-display')).toHaveText('0.3');
  await ctx.close();
});

test('그림판: 그리기 → 메모 탭 → 그림판 탭, 창 크기 변경 뒤에도 획 유지', async () => {
  const { ctx, page } = await launch('runner-paint');
  await startDrill(page, { section: '수리자료분석', count: 5 });
  await page.getByTestId('tab-paint').click();
  const box = (await page.getByTestId('paint-canvas').boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('paint-canvas')).toHaveAttribute('data-strokes', '1');
  await page.getByTestId('tab-memo').click();
  await page.getByTestId('tab-paint').click();
  await page.setViewportSize({ width: 400, height: 760 });
  await expect(page.getByTestId('paint-canvas')).toHaveAttribute('data-strokes', '1');
  await ctx.close();
});

test('DCAT 공간추리: 도구 잠금', async () => {
  const { ctx, page } = await launch('runner-lock');
  await startDrill(page, { section: '공간추리', count: 3 });
  await expect(page.getByTestId('tool-lock')).toBeVisible();
  await expect(page.getByTestId('calc-display')).toBeHidden();
  await page.keyboard.press('7');
  await expect(page.getByTestId('bubble-0-1')).toHaveAttribute('aria-pressed', 'false');
  await ctx.close();
});

test('340×530 창: 가로 스크롤 없음, OMR 4행 이상', async () => {
  const { ctx, page } = await launch('runner-small', { viewport: { width: 340, height: 530 } });
  await startDrill(page, { section: '수리자료분석', count: 10 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(340);
  const visible = await page.locator('[data-testid^="omr-row-"]').evaluateAll(rows =>
    rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }).length);
  expect(visible).toBeGreaterThanOrEqual(4);
  await ctx.close();
});
