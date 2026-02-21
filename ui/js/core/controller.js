/**
 * @fileoverview Controller - Camada de controle e coordenação (MVC)
 * @module core/controller
 *
 * Responsabilidade: Tratar eventos do usuário, coordenar Model e View,
 * e comunicar com o Main Process via window.api (IPC).
 */

import Model from "./model.js";
import View from "./view.js";
import { ELEMENT_IDS, CSS_CLASSES, SISTEMAS } from "../config/constants.js";

const Controller = {
  /**
   * Inicializa o Controller: registra handlers, carrega dados e listeners IPC.
   */
  init() {
    this.registrarHandlers();
    View.aplicarTema(Model.getTemaEscuro());
    this.carregarInfoSistema();
    this.registrarListenersIPC();
    this.sincronizarEstadoAtendeWindow();
  },

  /**
   * Registra todos os event listeners dos elementos da UI.
   */
  registrarHandlers() {
    document.getElementById(ELEMENT_IDS.CAPTURA)?.addEventListener("click", (e) => this.onCapturaClick(e));
    document.getElementById(ELEMENT_IDS.SMART)?.addEventListener("click", (e) => this.onSmartClick(e));
    document.getElementById(ELEMENT_IDS.DOC_AVULSOS)?.addEventListener("click", (e) => this.onDocAvulsosClick(e));
    document.getElementById(ELEMENT_IDS.VALIDACAO)?.addEventListener("click", (e) => this.onValidacaoClick(e));
    document.getElementById(ELEMENT_IDS.PONTO_VALID)?.addEventListener("click", (e) => this.onPontoValidClick(e));
    document.getElementById(ELEMENT_IDS.PONTO_RENOVA)?.addEventListener("click", (e) => this.onPontoRenovaClick(e));
    document.getElementById(ELEMENT_IDS.ATENDE)?.addEventListener("click", (e) => this.onAtendeClick(e));

    document.getElementById(ELEMENT_IDS.ATENDE_CONFIG_BTN)?.addEventListener("click", (e) => this.onAtendeConfigClick(e));
    document.getElementById(ELEMENT_IDS.ATENDE_SAVE)?.addEventListener("click", () => this.onAtendeModalSave());
    document.getElementById(ELEMENT_IDS.ATENDE_CANCEL)?.addEventListener("click", () => this.onAtendeModalCancel());
    document.getElementById(ELEMENT_IDS.ATENDE_MODAL)?.addEventListener("click", (e) => {
      if (e.target.id === ELEMENT_IDS.ATENDE_MODAL) this.onAtendeModalCancel();
    });
    document.getElementById(ELEMENT_IDS.ATENDE_INPUT)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.onAtendeModalSave();
    });

    document.getElementById(ELEMENT_IDS.TOGGLE_SIDEBAR)?.addEventListener("click", () => this.onToggleSidebar());
    document.getElementById(ELEMENT_IDS.UPDATE_INDICATOR)?.addEventListener("click", () => this.onUpdateClick());

    document.querySelectorAll(`.${CSS_CLASSES.DOTS}`).forEach((dot) => {
      dot.addEventListener("click", (e) => this.onDotClick(e));
    });
    document.addEventListener("click", () => this.onDocumentClick());

    document.querySelectorAll(`.${CSS_CLASSES.BTN_RELOAD}`).forEach((btn) => {
      btn.addEventListener("click", (e) => this.onReloadClick(e));
    });
    document.querySelectorAll(`.${CSS_CLASSES.BTN_CACHE}`).forEach((btn) => {
      btn.addEventListener("click", () => this.onCacheClick());
    });

    document.getElementById(ELEMENT_IDS.THEME_TOGGLE)?.addEventListener("change", (e) => this.onThemeToggle(e));
  },

  /**
   * Registra listeners para eventos IPC do Main Process.
   */
  async sincronizarEstadoAtendeWindow() {
    try {
      const aberta = await window.api.isAtendeWindowOpen();
      View.setAtendeWindowOpen(!!aberta);
    } catch (_) {}
  },

  registrarListenersIPC() {
    window.api.onLoadFinished((sistema) => {
      Model.setCarregando(false);
      View.mostrarLoading(false);
      if (sistema && sistema !== "atende") {
        Model.setSistemaAtivo(sistema);
        View.setMenuAtivoPorId(sistema);
      }
    });

    window.api.onAtendeWindowOpened(() => {
      View.setAtendeWindowOpen(true);
    });

    window.api.onAtendeWindowClosed(() => {
      View.setAtendeWindowOpen(false);
    });

    window.api.onUpdateReady(() => {
      Model.setAtualizacaoPronta(true);
      View.mostrarBadgeAtualizacao(true);
    });

    window.api.onUpdateIP((novoIp) => {
      Model.setInfoSistema({ ip: novoIp });
      View.atualizarIP(novoIp);
    });
  },

  /**
   * Carrega as informações do sistema via IPC e atualiza a View.
   */
  async carregarInfoSistema() {
    const info = await window.api.getSystemInfo();
    Model.setInfoSistema(info);
    View.atualizarInfoSistema(Model.getInfoSistema());
  },

  /**
   * Verifica se uma operação está em andamento (bloqueia ações).
   * @returns {boolean}
   */
  bloquearSeCarregando() {
    return Model.getCarregando();
  },

  /* ========== HANDLERS DE EVENTOS ========== */

  /**
   * Handler: clique no botão CapturaWeb.
   */
  async onCapturaClick(e) {
    if (this.bloquearSeCarregando() || e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE)) return;

    Model.setSistemaAtivo("captura");
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, SISTEMAS.CAPTURA);

    await window.api.abrirCaptura();
  },

  /**
   * Handler: clique no botão SMART.
   */
  async onSmartClick(e) {
    if (this.bloquearSeCarregando() || e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE)) return;

    Model.setSistemaAtivo("smart");
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, SISTEMAS.SMART);

    await window.api.abrirSmart();
  },

  /**
   * Handler: clique no botão Doc Avulso (Antigo).
   */
  async onDocAvulsosClick(e) {
    if (this.bloquearSeCarregando() || e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE)) return;

    Model.setSistemaAtivo("doc-avulsos");
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, SISTEMAS.DOC_AVULSOS);

    await window.api.abrirDocAvulsos();
  },

  /**
   * Handler: clique no botão Validação.
   */
  async onValidacaoClick(e) {
    if (this.bloquearSeCarregando() || e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE)) return;

    Model.setSistemaAtivo("validacao");
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, SISTEMAS.VALIDACAO);

    await window.api.abrirValidacao();
  },

  /**
   * Handler: clique no botão Ponto Valid.
   */
  async onPontoValidClick(e) {
    if (this.bloquearSeCarregando() || e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE)) return;

    Model.setSistemaAtivo("ponto-valid");
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, SISTEMAS.PONTO_VALID);

    await window.api.abrirPontoValid();
  },

  /**
   * Handler: clique no botão Ponto Renova.
   */
  async onPontoRenovaClick(e) {
    if (this.bloquearSeCarregando() || e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE)) return;

    Model.setSistemaAtivo("ponto-renova");
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, SISTEMAS.PONTO_RENOVA);

    await window.api.abrirPontoRenova();
  },

  /**
   * Handler: clique no botão Atende.
   * Se IP não configurado, exibe modal para configurar.
   */
  async onAtendeClick(e) {
    if (this.bloquearSeCarregando()) return;

    const result = await window.api.abrirAtende();

    if (result?.needsConfig) {
      View.fecharDropdowns();
      View.mostrarModalAtendeConfig("");
      return;
    }

    /* Atende abre em janela separada; estado "janela aberta" vem via onAtendeWindowOpened */
  },

  /**
   * Handler: clique em "Configurar endereço" no dropdown do Atende.
   */
  async onAtendeConfigClick(e) {
    if (this.bloquearSeCarregando()) return;

    e.stopPropagation();
    View.fecharDropdowns();

    const config = await window.api.getAtendeConfig();
    View.mostrarModalAtendeConfig(config?.ip || "");
  },

  /**
   * Handler: clique em "Salvar e Abrir" no modal do Atende.
   */
  async onAtendeModalSave() {
    const ip = View.getValorInputAtende();
    if (!ip) return;

    const ok = await window.api.setAtendeConfig(ip);
    if (!ok) return;

    View.fecharModalAtendeConfig();

    await window.api.abrirAtende();
    /* Janela do Atende abre; estado vem via onAtendeWindowOpened */
  },

  /**
   * Handler: clique em "Cancelar" no modal do Atende.
   */
  onAtendeModalCancel() {
    View.fecharModalAtendeConfig();
  },

  /**
   * Handler: clique no botão de colapsar/expandir sidebar.
   */
  onToggleSidebar() {
    if (this.bloquearSeCarregando()) return;

    const isCollapsed = View.toggleSidebar();
    Model.setSidebarColapsada(isCollapsed);
    window.api.resizeSidebar(isCollapsed ? 32 : 220);
  },

  /**
   * Handler: clique no badge de atualização pronta.
   */
  async onUpdateClick() {
    if (this.bloquearSeCarregando()) return;

    Model.setCarregando(true);
    View.mostrarLoading(true, SISTEMAS.ATUALIZACAO);
    await window.api.applyUpdateNow();
  },

  /**
   * Handler: clique nos três pontos (⋮) para abrir dropdown.
   */
  onDotClick(e) {
    if (this.bloquearSeCarregando()) return;

    e.stopPropagation();
    const menuId = e.currentTarget.dataset.menu;
    View.fecharDropdowns(menuId);
    View.toggleDropdown(menuId);
  },

  /**
   * Handler: clique em qualquer lugar do documento (fecha dropdowns).
   */
  onDocumentClick() {
    View.fecharDropdowns();
  },

  /**
   * Handler: clique em "Reiniciar página".
   * Se for o botão do dropdown do Atende, recarrega a janela do Atende.
   */
  onReloadClick(e) {
    if (this.bloquearSeCarregando()) return;

    if (e.target?.closest?.("[data-reload-target]")?.dataset?.reloadTarget === "atende") {
      window.api.reloadAtendeWindow();
      return;
    }

    const activeBtn = document.querySelector(`.${CSS_CLASSES.MENU_BTN}.${CSS_CLASSES.ACTIVE} span`)?.innerText.trim() || "Sistema";
    Model.setCarregando(true);
    View.mostrarLoading(true, activeBtn);
    window.api.reloadPage();
  },

  /**
   * Handler: clique em "Limpar cache".
   * Não afeta o Atende (mantém cache e estado).
   */
  async onCacheClick() {
    if (this.bloquearSeCarregando()) return;

    Model.setCarregando(true);
    View.mostrarLoading(true, SISTEMAS.CACHE);
    await window.api.clearCache();
    Model.setCarregando(false);
    View.mostrarLoading(false);
  },

  /**
   * Handler: alteração do interruptor de tema (checkbox).
   */
  onThemeToggle(e) {
    if (this.bloquearSeCarregando()) return;

    const checkbox = e?.target;
    const isDark = checkbox ? checkbox.checked : Model.getTemaEscuro();
    Model.setTemaEscuro(isDark);
    View.aplicarTema(isDark);
  },
};

export default Controller;
