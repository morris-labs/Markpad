import { App } from './app';
import './styles/app.css';
import './styles/document.css';

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page is missing the #${id} element.`);
  return element;
}

const app = new App(
  requireElement('tab-bar'),
  requireElement('documents'),
  requireElement('status-bar'),
);
void app.start();
