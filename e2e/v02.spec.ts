import { test, expect, type Page } from '@playwright/test';
import { APP_URL, launch } from './helpers';

const ANSWERS = '12345'.repeat(15);

async function finishExternalDcat(page: Page, label = '합격시대 DCAT 2회') {
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '새 세션' }).click();
  await page.getByLabel('범위').selectOption('external');
  await page.getByLabel('외부 모의 이름').fill(label);
  await page.getByLabel('모드').selectOption('soft');
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  for (let section = 0; section < 5; section += 1) {
    await page.getByRole('button', { name: '종료' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인' }).click();
    if (section < 4) await page.getByRole('button', { name: '시작', exact: true }).click();
  }
}

async function openExternalKeyEntry(page: Page, label?: string) {
  await finishExternalDcat(page, label);
  await page.getByRole('button', { name: '채점 입력', exact: true }).click();
}

async function dragTagRows(page: Page, from: number, to: number) {
  const start = page.getByTestId(`tag-row-${from}`);
  const end = page.getByTestId(`tag-row-${to}`);
  await expect(start).toBeVisible();
  await expect(end).toBeVisible();
  await start.dragTo(end);
}

test('외부 DCAT 채점 뒤 유형을 칠하고 다시 열어도 저장된다', async () => {
  test.setTimeout(60_000);
  const { ctx, page } = await launch('v02-external-grade-tags');
  try {
    await openExternalKeyEntry(page);
    await page.getByLabel('내 답').fill(ANSWERS);
    await page.getByLabel('정답').fill(ANSWERS);
    await expect(page.getByTestId('external-preview-row-0')).toContainText('○');
    await page.getByRole('button', { name: '채점 저장', exact: true }).click();
    await expect(page.getByTestId('score-total')).toHaveText('75/75');

    await expect(page.getByTestId('tag-row-0')).toContainText('명제추리');
    await page.getByRole('button', { name: '단문독해', exact: true }).click();
    await dragTagRows(page, 0, 1);
    await expect(page.getByTestId('tag-row-0')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-1')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-2')).toContainText('명제추리');

    await page.reload();
    await page.getByRole('button', { name: /시간 내 75\/75 · 전체 75\/75/ }).click();
    await expect(page.getByTestId('tag-row-0')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-1')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-2')).toContainText('명제추리');
  } finally {
    await ctx.close();
  }
});

test('외부 채점은 길이 불일치와 잘못된 문자를 저장하지 않고 원문자와 전각 숫자를 정규화한다', async () => {
  test.setTimeout(60_000);
  const { ctx, page } = await launch('v02-external-validation');
  try {
    await openExternalKeyEntry(page, 'DCAT 입력 검사');
    await page.getByLabel('내 답').fill(ANSWERS.slice(0, 74));
    await page.getByLabel('정답').fill(ANSWERS);
    await expect(page.getByRole('alert')).toContainText('75');
    await expect(page.getByRole('button', { name: '채점 저장', exact: true })).toBeDisabled();

    await page.getByLabel('내 답').fill(`${ANSWERS.slice(0, 74)}x`);
    await expect(page.getByRole('alert')).toContainText('x');
    await expect(page.getByRole('button', { name: '채점 저장', exact: true })).toBeDisabled();

    const normalized = '①②③④⑤'.repeat(7) + '１２３４５'.repeat(8);
    await page.getByLabel('내 답').fill(normalized);
    await page.getByLabel('정답').fill(normalized);
    await expect(page.getByTestId('external-preview-row-0')).toContainText('1');
    await expect(page.getByTestId('external-preview-row-0')).toContainText('○');
    await expect(page.getByTestId('external-preview-row-1')).toContainText('2');
    await expect(page.getByTestId('external-preview-row-1')).toContainText('○');

    await page.getByLabel('내 답').fill(`0${ANSWERS.slice(1)}`);
    await page.getByLabel('정답').fill(`-${ANSWERS.slice(1)}`);
    await expect(page.getByTestId('external-preview-row-0')).toContainText('—');

    await page.getByLabel('내 답').fill(normalized);
    await page.getByLabel('정답').fill(normalized);
    await page.getByRole('button', { name: '채점 저장', exact: true }).click();
    await expect(page.getByTestId('score-total')).toHaveText('75/75');
  } finally {
    await ctx.close();
  }
});

test('DCAT 기본 틀을 저장하고 적용하며 LG에는 기본 틀이 없다', async () => {
  test.setTimeout(60_000);
  const { ctx, page } = await launch('v02-template-controls');
  try {
    await openExternalKeyEntry(page, 'DCAT 기본 틀');
    await page.getByLabel('내 답').fill(ANSWERS);
    await page.getByLabel('정답').fill(ANSWERS);
    await page.getByRole('button', { name: '채점 저장', exact: true }).click();
    await expect(page.getByTestId('tag-row-0')).toContainText('명제추리');
    await page.getByRole('button', { name: '단문독해', exact: true }).click();
    await dragTagRows(page, 0, 1);
    await expect(page.getByTestId('tag-row-0')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-1')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-2')).toContainText('명제추리');
    await page.getByRole('button', { name: '기본 틀로 저장', exact: true }).click();

    await page.getByRole('button', { name: '어휘추리', exact: true }).click();
    await page.getByTestId('tag-row-0').click();
    await expect(page.getByTestId('tag-row-0')).toContainText('어휘추리');
    await page.getByRole('button', { name: '기본 틀 적용', exact: true }).click();
    await expect(page.getByTestId('tag-row-0')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-1')).toContainText('단문독해');
    await expect(page.getByTestId('tag-row-2')).toContainText('명제추리');

    await page.getByRole('button', { name: '홈으로', exact: true }).click();
    await page.getByRole('button', { name: '새 세션' }).click();
    await page.getByLabel('프로필').selectOption('lg-wayfit');
    await page.getByLabel('범위').selectOption('full');
    await page.getByLabel('모드').selectOption('soft');
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.getByRole('button', { name: '종료', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByRole('button', { name: '세션 종료', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    await page.getByLabel('정답').fill('12345'.repeat(16));
    await page.getByRole('button', { name: '채점 저장', exact: true }).click();
    await expect(page.getByRole('button', { name: '기본 틀로 저장', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '기본 틀 적용', exact: true })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test('첫 부팅 분석은 시드 가족별 약점과 필터·세부 위치를 보여준다', async () => {
  test.setTimeout(60_000);
  const { ctx, page } = await launch('v02-analysis');
  try {
    await page.goto(APP_URL);
    await page.getByRole('button', { name: '분석', exact: true }).click();

    const familyTable = page.getByRole('table', { name: '가족별 분석' });
    await expect(familyTable).toBeVisible();
    await expect(familyTable.locator('tbody > tr').first()).toContainText('전개도');
    await expect(familyTable).toContainText('0/6');
    await expect(familyTable).toContainText('8%');
    await expect(page.getByTestId('verdict-study')).toContainText('전개도');
    await expect(page.getByTestId('verdict-study')).toContainText('자료해석');
    await expect(page.getByTestId('verdict-study')).toContainText('도형추리');
    await expect(page.getByTestId('scatter')).toBeVisible();
    await expect(page.getByTestId('verdict-speed')).toBeEmpty();
    await expect(page.getByTestId('verdict-defer')).toBeEmpty();
    await expect(page.getByTestId('verdict-guess')).toContainText('전개도');

    await familyTable.getByRole('button', { name: /전개도/ }).click();
    const rows = familyTable.locator('tbody > tr');
    await expect(rows.nth(1)).toContainText('절반의 물');
    await expect(rows.nth(1)).toContainText('58');
    await expect(rows.nth(1)).toContainText('59');
    await expect(familyTable.locator('tbody > tr')).toHaveCount(14);

    await page.getByLabel('프로필').selectOption('lg-wayfit');
    await expect(familyTable.locator('tbody > tr')).toHaveCount(0);
    await page.getByLabel('프로필').selectOption('dcat');
    await page.getByLabel('출처').selectOption('tool');
    await expect(familyTable.locator('tbody > tr')).toHaveCount(0);
    await page.getByLabel('출처').selectOption('import');
    await expect(familyTable.locator('tbody > tr').first()).toContainText('전개도');
    await page.getByLabel('조건').selectOption('external');
    await expect(familyTable.locator('tbody > tr')).toHaveCount(0);
    await page.getByLabel('조건').selectOption('external-overtime');
    await expect(familyTable.locator('tbody > tr').first()).toContainText('전개도');
    await expect(page.getByLabel('최근 N회')).toHaveValue('all');
    await expect(page.getByLabel('첫 풀이만')).toBeChecked();
  } finally {
    await ctx.close();
  }
});
