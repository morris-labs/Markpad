import { App } from './app';
import './styles/app.css';
import './styles/document.css';
import './styles/toolbar.css';
import './styles/syntax.css';

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
  requireElement('status-bar'),
);
void app.start();
