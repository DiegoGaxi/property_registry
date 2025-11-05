import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["toggle"];

  toggle(event) {
    const id = event.currentTarget.dataset.id;
    const row = document.getElementById(id);
    if (!row) return;
    const visible = row.style.display !== 'none';
    row.style.display = visible ? 'none' : '';
  }
}
