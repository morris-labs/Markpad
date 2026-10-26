import type { ThemeSetting } from '@shared/api';
import { App } from './app';
import { installBrowserStub } from './browserStub';
import './styles/tokens.css';
import './styles/app.css';
import './styles/document.css';
import './styles/toolbar.css';
import './styles/syntax.css';

// Outside Electron, as in the browser preview, use an in-memory stand-in.
if (!('markpad' in window)) installBrowserStub();

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page is missing the #${id} element.`);
  return element;
}

const app = new App(
  requireElement('toolbar'),
  requireElement('context-bar'),
  requireElement('tab-bar'),
  requireElement('documents'),
  requireElement('outline'),
  requireElement('status-bar'),
);
/** Applies the View > Theme setting; "system" leaves the choice to the OS. */
function applyTheme(theme: ThemeSetting): void {
  if (theme === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}

window.markpad.onThemeChanged(applyTheme);
void window.markpad.getTheme().then(applyTheme);
void app.start();
