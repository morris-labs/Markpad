import { expect, test, type Page } from '@playwright/test';
import { closeApp, createWorkspace, editor, launchApp } from './app';

function button(page: Page, label: string) {
  return page.getByRole('button', { name: label, exact: true });
}

/**
 * Places the cursor at the end of the block that contains `text`.
 *
 * ProseMirror ignores selection changes for a moment after a click, so the
 * helper pauses briefly, as a person would, before the next action.
 */
async function placeCursor(page: Page, text: string): Promise<void> {
  await editor(page).getByText(text, { exact: true }).click();
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
}

/** Selects all text in the block that contains `text`. */
async function selectBlock(page: Page, text: string): Promise<void> {
  await editor(page).getByText(text, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.waitForTimeout(150);
}

test('formatting buttons change the document and its file', async () => {
  const ws = createWorkspace();
  const file = ws.write('fmt.md', 'alpha\n\nbeta\n\ngamma\n\ndelta\n');
  const { app, page } = await launchApp(ws, [file]);

  await selectBlock(page, 'alpha');
  await button(page, 'Bold').click();
  await expect(button(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');

  await placeCursor(page, 'beta');
  await page.getByRole('combobox', { name: 'Paragraph style' }).selectOption('2');
  await expect(editor(page).locator('h2')).toHaveText('beta');

  await placeCursor(page, 'gamma');
  await button(page, 'Bulleted list').click();
  await expect(button(page, 'Bulleted list')).toHaveAttribute('aria-pressed', 'true');

  await placeCursor(page, 'delta');
  await button(page, 'Task list').click();
  await expect(editor(page).locator('li[data-item-type="task"]')).toHaveCount(1);

  // Two adjacent lists need different bullets, or Markdown merges them into one.
  await expect
    .poll(() => ws.read('fmt.md'))
    .toBe('**alpha**\n\n## beta\n\n- gamma\n\n* [ ] delta\n');
  await closeApp(app);
});

test('clicking a task checkbox toggles it', async () => {
  const ws = createWorkspace();
  const file = ws.write('tasks.md', '- [ ] open\n');
  const { app, page } = await launchApp(ws, [file]);
  const item = editor(page).locator('li[data-item-type="task"]');
  const box = await item.boundingBox();
  if (!box) throw new Error('The task item has no box.');
  await page.mouse.click(box.x - 12, box.y + 10);
  await expect(item).toHaveAttribute('data-checked', 'true');
  await expect.poll(() => ws.read('tasks.md')).toBe('- [x] open\n');
  await closeApp(app);
});

test('the link editor adds a link to the selection', async () => {
  const ws = createWorkspace();
  const file = ws.write('link.md', 'visit site\n');
  const { app, page } = await launchApp(ws, [file]);
  await selectBlock(page, 'visit site');
  await page.keyboard.press('Control+K');
  const input = page.getByRole('textbox', { name: 'Link address' });
  await input.fill('https://example.com');
  await input.press('Enter');
  await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com');
  await expect.poll(() => ws.read('link.md')).toBe('[visit site](https://example.com)\n');
  await closeApp(app);
});

test('the table picker inserts a table of the chosen size', async () => {
  const ws = createWorkspace();
  const file = ws.write('table.md', 'text\n');
  const { app, page } = await launchApp(ws, [file]);
  await placeCursor(page, 'text');
  await button(page, 'Insert table').click();
  await page.getByRole('button', { name: '2 by 3 table' }).click();
  await expect(editor(page).locator('table tr')).toHaveCount(2);
  await expect(editor(page).locator('table tr').first().locator('th')).toHaveCount(3);
  await closeApp(app);
});
