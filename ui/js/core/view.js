/**
 * @fileoverview View - Camada de renderização e atualização da interface (MVC)
 * @module core/view
 *
 * Responsabilidade: Toda manipulação do DOM e exibição visual.
 * A View não contém lógica de negócio; apenas reflete o estado.
 */

import { ELEMENT_IDS, CSS_CLASSES } from "../config/constants.js";

/**
 * Seletores dos elementos do DOM.
 * Usa funções para garantir acesso atualizado (DOM pode mudar).
 */
const elementos = {
  loading: () => document.getElementById(ELEMENT_IDS.LOADING),
  loaderText: () => document.querySelector(`#${ELEMENT_IDS.LOADING} p`),
  contentArea: () => document.querySelector(".content"),
  placeholder: () => document.getElementById(ELEMENT_IDS.PLACEHOLDER),
  menuBtns: () => document.querySelectorAll(`.${CSS_CLASSES.MENU_BTN}`),
  sidebar: () => document.getElementById(ELEMENT_IDS.SIDEBAR),
  sidebarWrapper: () => document.getElementById(ELEMENT_IDS.SIDEBAR_WRAPPER),
  toggleIcon: () => document.getElementById(ELEMENT_IDS.TOGGLE_ICON),
  themeCheckbox: () => document.getElementById(ELEMENT_IDS.THEME_TOGGLE),
  updateIndicator: () => document.getElementById(ELEMENT_IDS.UPDATE_INDICATOR),
  versionEl: () => document.getElementById(ELEMENT_IDS.APP_VERSION),
  themeIcon: () => document.getElementById(ELEMENT_IDS.THEME_ICON),
  themeText: () => document.getElementById(ELEMENT_IDS.THEME_TEXT),
  hostnameEl: () => document.getElementById(ELEMENT_IDS.HOSTNAME),
  ipEl: () => document.getElementById(ELEMENT_IDS.IP),
  anydeskEl: () => document.getElementById(ELEMENT_IDS.ANYDESK),
  dropdowns: () => document.querySelectorAll(`.${CSS_CLASSES.DROPDOWN}`),
};

const View = {
  elementos,

  /**
   * Exibe ou oculta o overlay de loading.
   * Bloqueia interação do usuário quando ativo.
   * @param {boolean} mostrar
   * @param {string} [nomeSistema=""] - Nome exibido no texto (ex: "CapturaWeb")
   */
  mostrarLoading(mostrar, nomeSistema = "") {
    const loader = this.elementos.loading();
    const loaderText = this.elementos.loaderText();
    const contentArea = this.elementos.contentArea();

    if (loader) {
      if (mostrar) {
        loader.classList.remove(CSS_CLASSES.HIDDEN);
        if (loaderText && nomeSistema) {
          loaderText.innerText = `Iniciando ${nomeSistema}`;
        }
        contentArea?.classList.remove("fade-in-view");
      } else {
        loader.classList.add(CSS_CLASSES.HIDDEN);
        if (contentArea) {
          contentArea.classList.remove("fade-in-view");
          void contentArea.offsetWidth; // Force reflow para animação
          contentArea.classList.add("fade-in-view");
        }
      }
    }

    document.body.style.pointerEvents = mostrar ? "none" : "auto";
    document.body.style.cursor = mostrar ? "wait" : "default";
  },

  /**
   * Marca um botão do menu como ativo e oculta o placeholder.
   * @param {HTMLElement|null} btn - Botão a marcar como ativo
   */
  setMenuAtivo(btn) {
    this.elementos.menuBtns().forEach((b) => b.classList.remove(CSS_CLASSES.ACTIVE));
    btn?.classList.add(CSS_CLASSES.ACTIVE);
    this.elementos.placeholder()?.classList.add(CSS_CLASSES.HIDDEN);
  },

  /**
   * Marca o botão ativo pelo ID do sistema (garante estado correto após load-finished).
   * @param {string} sistemaId - "captura" | "smart" | "doc-avulsos" | "validacao" | "ponto-valid" | "ponto-renova" | "atende"
   */
  setMenuAtivoPorId(sistemaId) {
    const btn = document.getElementById(sistemaId);
    this.setMenuAtivo(btn);
  },

  /**
   * Alterna o estado colapsado/expandido da sidebar (wrapper).
   * Atualiza o ícone do toggle.
   * @returns {boolean} true se ficou colapsada
   */
  toggleSidebar() {
    const wrapper = this.elementos.sidebarWrapper();
    const toggleIcon = this.elementos.toggleIcon();
    const isCollapsed = wrapper?.classList.toggle(CSS_CLASSES.COLLAPSED);

    if (toggleIcon) {
      toggleIcon.className = isCollapsed ? "fas fa-angles-right" : "fas fa-angles-left";
    }

    return isCollapsed ?? false;
  },

  /**
   * Exibe ou oculta o badge de atualização pronta.
   * @param {boolean} mostrar
   */
  mostrarBadgeAtualizacao(mostrar) {
    const indicator = this.elementos.updateIndicator();
    if (indicator) {
      indicator.style.display = mostrar ? "flex" : "none";
    }
  },

  /**
   * Atualiza os elementos com as informações do sistema.
   * @param {Object} info - { version?, hostname?, ip?, anydesk? }
   */
  atualizarInfoSistema(info) {
    const { version, hostname, ip, anydesk } = info;
    const versionEl = this.elementos.versionEl();
    const hostnameEl = this.elementos.hostnameEl();
    const ipEl = this.elementos.ipEl();
    const anydeskEl = this.elementos.anydeskEl();

    if (versionEl && version) versionEl.innerText = `v${version}`;
    if (hostnameEl && hostname) hostnameEl.innerText = hostname;
    if (ipEl && ip) ipEl.innerText = ip;
    if (anydeskEl && anydesk) anydeskEl.innerText = anydesk;
  },

  /**
   * Atualiza apenas o campo IP (chamado em tempo real quando muda).
   * @param {string} ip
   */
  atualizarIP(ip) {
    const ipEl = this.elementos.ipEl();
    if (ipEl) ipEl.innerText = ip;
  },

  /**
   * Aplica o tema claro ou escuro no body e no interruptor (checkbox).
   * @param {boolean} escuro - true = tema escuro
   */
  aplicarTema(escuro) {
    const body = document.body;
    const checkbox = this.elementos.themeCheckbox();

    body.classList.toggle(CSS_CLASSES.DARK_THEME, escuro);
    body.classList.toggle(CSS_CLASSES.LIGHT_THEME, !escuro);
    if (checkbox) checkbox.checked = escuro;
  },

  /**
   * Fecha todos os dropdowns, exceto o especificado.
   * @param {string|null} [excetoId=null] - ID do dropdown a manter aberto
   */
  fecharDropdowns(excetoId = null) {
    this.elementos.dropdowns().forEach((d) => {
      if (d.id !== excetoId) d.classList.remove(CSS_CLASSES.SHOW);
    });
  },

  /**
   * Define o estado visual "janela do Atende aberta" no botão do Atende.
   * @param {boolean} aberta
   */
  setAtendeWindowOpen(aberta) {
    const btn = document.getElementById(ELEMENT_IDS.ATENDE);
    if (btn) {
      if (aberta) {
        btn.classList.add(CSS_CLASSES.ATENDE_WINDOW_OPEN);
      } else {
        btn.classList.remove(CSS_CLASSES.ATENDE_WINDOW_OPEN);
      }
    }
  },

  /**
   * Alterna a visibilidade de um dropdown.
   * @param {string} menuId - ID do elemento dropdown
   */
  toggleDropdown(menuId) {
    const dropdown = document.getElementById(menuId);
    if (dropdown) {
      dropdown.classList.toggle(CSS_CLASSES.SHOW);
    }
  },

  /**
   * Exibe o modal de configuração do Atende.
   * @param {string} [ipAtual=""] - IP atual para preencher o input
   */
  mostrarModalAtendeConfig(ipAtual = "") {
    const modal = document.getElementById(ELEMENT_IDS.ATENDE_MODAL);
    const input = document.getElementById(ELEMENT_IDS.ATENDE_INPUT);
    if (modal && input) {
      input.value = ipAtual;
      modal.classList.remove(CSS_CLASSES.HIDDEN);
      input.focus();
      if (window.api?.setAtendeModalVisible) {
        window.api.setAtendeModalVisible(true);
      }
    }
  },

  /**
   * Fecha o modal de configuração do Atende.
   */
  fecharModalAtendeConfig() {
    const modal = document.getElementById(ELEMENT_IDS.ATENDE_MODAL);
    const input = document.getElementById(ELEMENT_IDS.ATENDE_INPUT);
    if (modal && input) {
      modal.classList.add(CSS_CLASSES.HIDDEN);
      input.value = "";
      if (window.api?.setAtendeModalVisible) {
        window.api.setAtendeModalVisible(false);
      }
    }
  },

  /**
   * Retorna o valor do input de IP do Atende.
   * @returns {string}
   */
  getValorInputAtende() {
    const input = document.getElementById(ELEMENT_IDS.ATENDE_INPUT);
    return input?.value?.trim() || "";
  },
};

export default View;
