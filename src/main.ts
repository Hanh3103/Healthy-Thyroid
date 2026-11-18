import { setupEvents } from './events';
import { render } from './render';
import { saveState } from './state';

export function commit(): void {
  saveState();
  render();
}

window.addEventListener('DOMContentLoaded', () => {
  setupEvents(commit);
  render();
});
