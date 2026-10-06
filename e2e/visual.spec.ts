import { expect, test } from '@playwright/test';
test('扩展视口矩阵与全部页面', async ({ page }, info) => {
  test.skip(info.project.name !== '桌面', '扩展矩阵由桌面项目覆盖');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/'); await page.getByLabel('访问令牌').fill('e2e-test-token'); await page.getByRole('button', { name: '验证并连接' }).click();
  await expect(page.getByRole('heading', { name: '任务中心' })).toBeVisible();
  const widths = [[390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [2560, 1080]];
  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`tasks-${width}.png`) });
    await page.getByRole('button', { name: '新建任务', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('textbox', { name: '任务需求' }).fill('校验长需求、冻结工作流、异常恢复与产物访问的控制台布局。');
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`modal-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '取消', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: /端到端文档任务/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: /端到端文档任务/ })).toBeVisible();
  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`detail-${width}.png`) });
    if (width <= 1100) {
      await page.getByRole('tab', { name: '产物', exact: true }).filter({ visible: true }).click();
      await expect(page.getByText('report.md', { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await page.screenshot({ animations: 'disabled', path: info.outputPath(`artifacts-${width}.png`) });
      await page.getByRole('tab', { name: '执行过程', exact: true }).filter({ visible: true }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: '工作流模板', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工作流模板', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'document', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '只读源码', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('workflow-source.png') });
  await page.getByRole('link', { name: '仓库配置', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'test-repository', exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('repositories.png') });
  await page.getByRole('link', { name: '系统状态', exact: true }).click();
  await expect(page.getByText('确定性测试环境')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('system.png') });
  await page.getByRole('button', { name: '切换语言' }).click();
  await expect(page.getByRole('heading', { name: 'System status', exact: true }).first()).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: info.outputPath('system-en.png') });
  expect(errors).toEqual([]);
});
