import { test, expect } from '@playwright/test';
import { APP_URL, launch } from './helpers';
import { crc32, deflateSync } from 'node:zlib';

function tinyPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const content = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(content));
    return Buffer.concat([length, content, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('ShareX 파일 선택으로 캡처를 연결하고 문항 시간과 이미지를 확인한다', async () => {
  const { ctx, page } = await launch('v03-captures');
  try {
    const start = new Date(2026, 9, 9, 14, 32, 0).getTime();
    await page.clock.setFixedTime(start);
    await page.goto(APP_URL);
    const pickerType = await page.evaluate(() => typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker);
    console.log(`Chrome file:// typeof window.showDirectoryPicker = ${pickerType}`);
    await page.evaluate(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }));
    await page.getByRole('button', { name: '새 세션' }).click();
    await page.getByLabel('범위').selectOption('drill');
    await page.getByLabel('영역').selectOption({ label: '언어논리' });
    await page.getByLabel('문항 수').fill('3');
    await page.getByLabel('모드').selectOption('soft');
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.getByTestId('bubble-0-1').click();
    await page.getByTestId('bubble-1-2').click();
    await page.getByTestId('bubble-2-3').click();
    await page.clock.setFixedTime(start + 31_000);
    await page.getByRole('button', { name: '종료', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByLabel('정답').fill('123');
    await page.getByRole('button', { name: '채점 저장', exact: true }).click();
    await page.getByRole('button', { name: '캡처 연결', exact: true }).click();
    const names = await page.evaluate(times => times.map(t => {
      const d = new Date(t);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `AladinEbook_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`;
    }), [start + 1_000, start + 11_000, start + 21_000]);
    const png = tinyPng();
    await page.setInputFiles('input[type=file][accept="image/*"]', names.map(name => ({ name, mimeType: 'image/png', buffer: png })));
    await expect(page.getByRole('region', { name: '캡처 연결 미리보기' })).toContainText('파일 3 / 문항 3');
    await page.getByRole('button', { name: '한 칸 밀기', exact: true }).click();
    await expect(page.getByTestId('capture-preview-0')).toContainText(`2 → ${names[0]}`);
    await page.getByRole('button', { name: '한 칸 당기기', exact: true }).click();
    await page.getByRole('button', { name: '연결 저장', exact: true }).click();
    await page.getByText('문항별 결과', { exact: true }).click();
    const table = page.getByRole('table', { name: '문항별 결과' });
    await expect(table.getByRole('button', { name: '보기', exact: true })).toHaveCount(3);
    for (let q = 0; q < 3; q++) await expect(page.getByTestId(`question-time-${q}`)).toHaveText('10');
    await table.getByRole('button', { name: '보기', exact: true }).first().click();
    await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('img')).toHaveJSProperty('naturalWidth', 1);
    await page.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
    await page.reload();
    await page.getByRole('button', { name: /제한 시간 안 3\/3 · 전체 3\/3/ }).click();
    await page.getByText('문항별 결과', { exact: true }).click();
    await expect(page.getByTestId('question-time-0')).toHaveText('10');
    await page.getByRole('table', { name: '문항별 결과' }).getByRole('button', { name: '보기' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('파일 없음');
  } finally { await ctx.close(); }
});
