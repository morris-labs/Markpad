import { test } from '@playwright/test';
import { closeApp, createWorkspace, launchApp } from './app';

const SAMPLE = `---
title: Sample
---

# Markpad sample

A paragraph with **bold**, *italic*, ~~strike~~, \`code\`, and a [link](https://example.com).

## Lists

- First item
- Second item
  - Nested item

1. One
2. Two

- [ ] Open task
- [x] Done task

> A block quote.

\`\`\`js
const answer = 42;
\`\`\`

| Name | Value |
| ---- | ----: |
| Alpha | 1 |
| Beta | 2 |

---

The end.
`;

// Run with SCREENSHOT=PATH to save a picture of the app with sample content.
test('screenshot', async () => {
  const out = process.env['SCREENSHOT'];
  test.skip(!out, 'Set SCREENSHOT to a PNG path to take a screenshot.');
  const ws = createWorkspace();
  const { app, page } = await launchApp(ws, [ws.write('sample.md', SAMPLE)]);
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.emulateMedia({ colorScheme: process.env['THEME'] === 'dark' ? 'dark' : 'light' });
  await page.screenshot({ path: out ?? '' });
  await closeApp(app);
});
