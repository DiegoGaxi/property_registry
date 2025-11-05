import { Controller } from "@hotwired/stimulus";

// Adds fade-in / slide-up animation classes when element connects.
export default class extends Controller {
  static values = { variant: String };

  connect() {
    const variant = this.variantValue || 'fade';
    if (variant === 'slide') {
      this.element.classList.add('slide-up');
    } else {
      this.element.classList.add('fade-in');
    }
  }
}
