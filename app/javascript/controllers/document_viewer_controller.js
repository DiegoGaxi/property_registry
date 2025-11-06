import { Controller } from "@hotwired/stimulus";
export default class extends Controller {
  static values = { propertyId: Number }

  connect() {
    this._handleEsc = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._handleEsc);
  }

  disconnect() {
    document.removeEventListener('keydown', this._handleEsc);
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      this.modalContent = null;
    }
  }

  async open(e) {
    e.preventDefault();
    const url = `/properties/${this.propertyIdValue}/document`;
    this._ensureModal();
    this._setLoading();
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status);
      const blob = await resp.blob();
      // Liberar anterior URL si existía
      if (this._currentObjectUrl) URL.revokeObjectURL(this._currentObjectUrl);
      const objUrl = URL.createObjectURL(blob);
      this._currentObjectUrl = objUrl;
      // Solo el visor PDF centrado; ocultar barra lateral/toolbar del visor PDF si el navegador respeta los parámetros
      const viewerUrl = objUrl + '#toolbar=0&navpanes=0';
      this.modalContent.innerHTML = `<iframe class='doc-frame' src='${viewerUrl}'></iframe>`;
    } catch (e2) {
      this.modalContent.innerHTML = `<div class='error'>Error cargando documento: ${(e2.message || e2)}</div>`;
    }
    this._show();
  }

  close() {
    if (!this.modal) return;
    // Limpia iframe para detener carga y liberar memoria
    const frame = this.modal.querySelector('iframe');
    if (frame) frame.src = 'about:blank';
    this.modal.classList.remove('open');
    this.modal.style.display = 'none';
  }

  _ensureModal() {
    if (this.modal) return;
    this.modal = document.createElement('div');
    this.modal.className = 'doc-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.innerHTML = `
      <div class='doc-modal-backdrop'></div>
      <div class='doc-modal-inner'>
        <div class='doc-modal-header'>
          <span class='doc-modal-title'>Documento</span>
          <button type='button' class='close-btn' aria-label='Cerrar'>×</button>
        </div>
        <div class='doc-content'></div>
      </div>`;
    // Insertar en body para overlay pantalla completa
    document.body.appendChild(this.modal);
    this.modalContent = this.modal.querySelector('.doc-content');
    // Eventos de cierre
    const closeBtn = this.modal.querySelector('.close-btn');
    const backdrop = this.modal.querySelector('.doc-modal-backdrop');
    closeBtn.addEventListener('click', () => this.close());
    // Cierra con clic directo al backdrop
    backdrop.addEventListener('click', () => this.close());
    // Cierra con clic fuera del panel (en área oscura) usando delegación
    this.modal.addEventListener('mousedown', (ev) => {
      if (!ev.target.closest('.doc-modal-inner')) this.close();
    });
  }

  _show() {
    this.modal.style.display = 'block';
    requestAnimationFrame(() => this.modal.classList.add('open'));
  }

  _setLoading() {
    this.modalContent.innerHTML = `<div class='loading'>Cargando...</div>`;
  }
}