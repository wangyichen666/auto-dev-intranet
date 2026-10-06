import { expect, test, type Page } from '@playwright/test';
async function connect(page: Page) {
  await page.goto('/');
  await page.getByLabel('访问令牌').fill('e2e-test-token');
  await page.getByRole('button', { name: '验证并连接' }).click();
  await expect(page.getByRole('heading', { name: '任务中心' })).toBeVisible();
}
async function noOverflow(page: Page) {
  // 等待组件库弹窗动画和响应式测量收敛，再检查最终布局。
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { timeout: 3000 }).toBeLessThanOrEqual(0);
}

test('创建任务 → 状态变化 → 产物预览与下载', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} ${m.location().url}`); });
  await connect(page); await noOverflow(page); await page.screenshot({ animations: 'disabled', path: info.outputPath('tasks.png') });
  await page.getByRole('button', { name: '新建任务' }).first().click();
  await page.getByRole('textbox', { name: '任务需求' }).fill(`端到端文档任务 ${info.project.name}`);
  await page.getByRole('combobox', { name: '工作流模板' }).click();
  await page.getByText('document · v1 (document.yaml)', { exact: true }).click();
  await noOverflow(page); await page.screenshot({ animations: 'disabled', path: info.outputPath('create.png') });
  await page.getByRole('button', { name: '创建并入队' }).click();
  await expect(page).toHaveURL(/\/tasks\/test-run-/);
  await expect(page.getByRole('heading', { name: '端到端文档任务', exact: false })).toBeVisible();
  await expect(page.locator('[data-status="SUCCEEDED"]').first()).toBeVisible({ timeout: 20000 });
  if ((page.viewportSize()?.width ?? 1440) <= 1100) await page.getByRole('tab', { name: '产物', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: '预览', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: '测试报告', exact: true })).toBeVisible();
  await noOverflow(page); await page.screenshot({ animations: 'disabled', path: info.outputPath('preview.png') });
  await page.getByRole('button', { name: '关闭', exact: true }).filter({ visible: true }).last().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).filter({ visible: true }).click();
  expect((await download).suggestedFilename()).toBe('report.md');
  await page.screenshot({ animations: 'disabled', path: info.outputPath('detail.png') });
  expect(errors).toEqual([]);
});
test('错误态、筛选、移动导航和工作流校验', async ({ page }, info) => {
  await connect(page);
  await page.getByRole('button', { name: '失败', exact: true }).click();
  await expect(page).toHaveURL(/status=FAILED/);
  await expect(page.getByRole('heading', { name: '没有匹配的任务' })).toBeVisible();
  await page.route('**/api/v1/runs?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', message: '服务不可用', requestId: 'e2e-error' } }) }));
  await page.getByRole('textbox', { name: '搜索任务标题、运行 ID 或工作流' }).fill('e2e-unavailable');
  await page.getByRole('textbox', { name: '搜索任务标题、运行 ID 或工作流' }).press('Enter');
  await expect(page.getByRole('heading', { name: '服务不可用' })).toBeVisible();
  await noOverflow(page); await page.screenshot({ animations: 'disabled', path: info.outputPath('error.png') });
  if (info.project.name === '移动') { await page.getByRole('button', { name: '打开导航' }).click(); await expect(page.getByRole('dialog')).toBeVisible(); }
  await page.getByRole('link', { name: '工作流模板', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: '工作流模板', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '校验 YAML' }).click();
  await page.getByRole('textbox', { name: 'YAML 源码' }).fill('name: one\nname: two');
  await page.getByRole('button', { name: '严格校验' }).click();
  await expect(page.getByText(/WORKFLOW_INVALID/).first()).toBeVisible(); await noOverflow(page);
});
