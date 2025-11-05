import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    window.addEventListener('toast', (e) => this.show(e.detail.message));
  }

  show(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.element.appendChild(el);
    setTimeout(() => {
      el.classList.add('visible');
    }, 10);
    setTimeout(() => {
      el.classList.remove('visible');
      el.addEventListener('transitionend', () => el.remove());
    }, 4000);
  }
}
