"use strict";

/**
 * @fileoverview View - Renderização e atualização da interface (MVC). Apenas DOM.
 * @module core/view
 */

import { ELEMENT_IDS, CSS_CLASSES } from "../config/constants.js";

/**
 * Seletores dos elementos do DOM.
 * Usa funções para garantir acesso atualizado (DOM pode mudar).
 */
const elementos = {
  loading: () => document.getElementById(ELEMENT_IDS.LOADING),
  loaderText: () => document.querySelector(`#${ELEMENT_IDS.LOADING} p`),
  contentLoadingBar: () => document.getElementById(ELEMENT_IDS.CONTENT_LOADING_BAR),
  contentArea: () => document.querySelector(".content"),
  placeholder: () => document.getElementById(ELEMENT_IDS.PLACEHOLDER),
  placeholderContainer: () => document.getElementById(ELEMENT_IDS.PLACEHOLDER_CONTAINER),
  placeholderOfflineMsg: () => document.getElementById(ELEMENT_IDS.PLACEHOLDER_OFFLINE_MSG),
  offlineBanner: () => document.getElementById(ELEMENT_IDS.OFFLINE_BANNER),
  menuBtns: () => document.querySelectorAll(`.${CSS_CLASSES.MENU_BTN}`),
  menuNav: () => document.querySelector("nav.menu"),
  sidebar: () => document.getElementById(ELEMENT_IDS.SIDEBAR),
  sidebarWrapper: () => document.getElementById(ELEMENT_IDS.SIDEBAR_WRAPPER),
  toggleIcon: () => document.getElementById(ELEMENT_IDS.TOGGLE_ICON),
  themeCheckbox: () => document.getElementById(ELEMENT_IDS.THEME_TOGGLE),
  updateIndicator: () => document.getElementById(ELEMENT_IDS.UPDATE_INDICATOR),
  versionEl: () => document.getElementById(ELEMENT_IDS.APP_VERSION),
  hostnameEl: () => document.getElementById(ELEMENT_IDS.HOSTNAME),
  ipEl: () => document.getElementById(ELEMENT_IDS.IP),
  anydeskEl: () => document.getElementById(ELEMENT_IDS.ANYDESK),
  dropdowns: () => document.querySelectorAll(`.${CSS_CLASSES.DROPDOWN}`),
};

const View = {
  elementos,

  /**
   * Exibe ou oculta o overlay de loading do launcher (troca de sistema).
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
        loader.style.display = "";
        if (loaderText && nomeSistema) {
          loaderText.innerText = `Iniciando ${nomeSistema}`;
        }
        contentArea?.classList.remove("fade-in-view");
      } else {
        loader.classList.add(CSS_CLASSES.HIDDEN);
        loader.style.display = "";
        if (contentArea) {
          contentArea.classList.remove("fade-in-view");
          void contentArea.offsetWidth;
          contentArea.classList.add("fade-in-view");
        }
      }
    }
    const menuNav = this.elementos.menuNav();
    if (menuNav) {
      menuNav.classList.toggle(CSS_CLASSES.MENU_BLOCKED, !!mostrar);
    }
  },

  /**
   * Exibe ou oculta a barra de carregamento da página (URL) dentro do launcher.
   * @param {boolean} mostrar
   */
  mostrarCarregamentoPagina(mostrar) {
    const bar = this.elementos.contentLoadingBar();
    if (!bar) return;
    if (mostrar) {
      bar.classList.remove(CSS_CLASSES.HIDDEN);
      bar.setAttribute("aria-hidden", "false");
    } else {
      bar.classList.add(CSS_CLASSES.HIDDEN);
      bar.setAttribute("aria-hidden", "true");
    }
  },

  /**
   * Marca um botão do menu como ativo e oculta o placeholder.
   * @param {HTMLElement|null} btn - Botão a marcar como ativo
   */
  setMenuAtivo(btn) {
    this.elementos.menuBtns().forEach((b) => b.classList.remove(CSS_CLASSES.ACTIVE));
    btn?.classList.add(CSS_CLASSES.ACTIVE);
    this.elementos.placeholder()?.classList.add(CSS_CLASSES.HIDDEN);
    this.elementos.placeholderOfflineMsg()?.classList.add(CSS_CLASSES.HIDDEN);
  },

  /**
   * Exibe ou oculta o aviso de offline (barra no topo da área de conteúdo).
   * @param {boolean} mostrar
   */
  mostrarOfflineBanner(mostrar) {
    const banner = this.elementos.offlineBanner();
    const container = this.elementos.placeholderContainer();
    const placeholderMsg = this.elementos.placeholderOfflineMsg();
    if (banner) {
      if (mostrar) {
        banner.classList.remove(CSS_CLASSES.HIDDEN);
        banner.setAttribute("aria-hidden", "false");
      } else {
        banner.classList.add(CSS_CLASSES.HIDDEN);
        banner.setAttribute("aria-hidden", "true");
      }
    }
    if (container) container.classList.toggle("is-offline", !!mostrar);
    if (placeholderMsg) {
      if (mostrar) placeholderMsg.classList.remove(CSS_CLASSES.HIDDEN);
      else placeholderMsg.classList.add(CSS_CLASSES.HIDDEN);
    }
  },

  /**
   * Mostra o placeholder e a mensagem de offline (falha de rede ou ao tentar acessar offline).
   * Força visibilidade para garantir que não fique tela em branco.
   */
  mostrarPlaceholderComOffline() {
    const placeholder = this.elementos.placeholder();
    const loading = this.elementos.loading();
    const banner = this.elementos.offlineBanner();
    const container = this.elementos.placeholderContainer();
    const offlineMsg = this.elementos.placeholderOfflineMsg();

    if (loading) {
      loading.classList.add(CSS_CLASSES.HIDDEN);
      loading.style.display = "none";
    }
    if (placeholder) {
      placeholder.classList.remove(CSS_CLASSES.HIDDEN);
      placeholder.style.display = "flex";
      placeholder.style.visibility = "visible";
    }
    if (container) container.classList.add("is-offline");
    if (offlineMsg) offlineMsg.classList.remove(CSS_CLASSES.HIDDEN);
    if (banner) {
      banner.classList.remove(CSS_CLASSES.HIDDEN);
      banner.style.display = "flex";
    }
    this.elementos.menuBtns().forEach((b) => b.classList.remove(CSS_CLASSES.ACTIVE));
  },

  /**
   * Mostra o placeholder padrão (online) para fluxos sem conteúdo embutido.
   * Evita tela branca quando o sistema abre em janela externa.
   */
  mostrarPlaceholderPadrao() {
    const placeholder = this.elementos.placeholder();
    const loading = this.elementos.loading();
    const banner = this.elementos.offlineBanner();
    const container = this.elementos.placeholderContainer();
    const offlineMsg = this.elementos.placeholderOfflineMsg();

    if (loading) {
      loading.classList.add(CSS_CLASSES.HIDDEN);
      loading.style.display = "none";
    }
    if (placeholder) {
      placeholder.classList.remove(CSS_CLASSES.HIDDEN);
      placeholder.style.display = "flex";
      placeholder.style.visibility = "visible";
    }
    if (banner) {
      banner.classList.add(CSS_CLASSES.HIDDEN);
      banner.style.display = "";
    }
    if (container) container.classList.remove("is-offline");
    if (offlineMsg) offlineMsg.classList.add(CSS_CLASSES.HIDDEN);
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
   * Atualiza o ícone e o texto do botão (Recolher/Expandir menu).
   * @returns {boolean} true se ficou colapsada
   */
  toggleSidebar() {
    const wrapper = this.elementos.sidebarWrapper();
    const toggleIcon = this.elementos.toggleIcon();
    const toggleBtn = document.getElementById(ELEMENT_IDS.TOGGLE_SIDEBAR);
    const isCollapsed = wrapper?.classList.toggle(CSS_CLASSES.COLLAPSED);

    if (toggleIcon) {
      toggleIcon.className = isCollapsed ? "fas fa-angles-right" : "fas fa-angles-left";
    }
    if (toggleBtn) {
      const texto = isCollapsed ? "Expandir menu" : "Recolher menu";
      toggleBtn.setAttribute("title", texto);
      toggleBtn.setAttribute("aria-label", texto);
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
      if (mostrar) indicator.classList.remove(CSS_CLASSES.HIDDEN);
      else indicator.classList.add(CSS_CLASSES.HIDDEN);
    }
  },

  /**
   * Exibe ou oculta o modal de confirmação de atualização.
   * @param {boolean} mostrar
   */
  mostrarModalUpdate(mostrar) {
    const modal = document.getElementById(ELEMENT_IDS.UPDATE_MODAL);
    if (modal) {
      if (mostrar) modal.classList.remove(CSS_CLASSES.HIDDEN);
      else modal.classList.add(CSS_CLASSES.HIDDEN);
    }
  },

  setChromeDownloadsPopoverOpen(aberto) {
    const panel = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_PANEL);
    const btn = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOAD_BTN);
    if (panel) panel.classList.toggle(CSS_CLASSES.HIDDEN, !aberto);
    if (btn) btn.setAttribute("aria-expanded", aberto ? "true" : "false");
  },

  setDownloadsToolbarBadge(activeCount) {
    const badge = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOAD_BADGE);
    if (!badge) return;
    const n = typeof activeCount === "number" ? activeCount : 0;
    if (n <= 0) {
      badge.classList.add(CSS_CLASSES.HIDDEN);
      badge.textContent = "0";
      return;
    }
    badge.classList.remove(CSS_CLASSES.HIDDEN);
    badge.textContent = n > 9 ? "9+" : String(n);
  },

  /**
   * @param {Array<{ name?: string, path?: string, state?: string, receivedBytes?: number, totalBytes?: number }>} items
   */
  renderChromeDownloadsList(items) {
    const list = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_LIST);
    const empty = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_EMPTY);
    if (!list || !empty) return;
    list.replaceChildren();
    const arr = Array.isArray(items) ? items : [];
    empty.classList.toggle(CSS_CLASSES.HIDDEN, arr.length > 0);
    for (const it of arr) {
      const row = document.createElement("div");
      row.className = "chrome-download-row";
      const name = document.createElement("span");
      name.className = "chrome-download-name";
      name.textContent = it.name || "Arquivo";
      const meta = document.createElement("div");
      meta.className = "chrome-download-meta";
      const st = String(it.state || "").toLowerCase();
      if (st === "progressing") {
        const rec = it.receivedBytes || 0;
        const tot = it.totalBytes || 0;
        const pct = tot > 0 ? Math.round((100 * rec) / tot) : 0;
        meta.textContent = tot > 0 ? `Baixando… ${pct}%` : "Baixando…";
      } else if (st === "completed") {
        meta.textContent = "Concluído · clique para abrir numa nova janela";
      } else {
        meta.textContent = st === "cancelled" ? "Cancelado" : "Interrompido";
      }
      row.appendChild(name);
      row.appendChild(meta);
      if (it.path && st === "completed") {
        const pathStr = String(it.path);
        row.classList.add("chrome-download-row--pdf");
        row.dataset.path = pathStr;
        row.title = "Clique para abrir numa nova janela";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chrome-download-folder-btn";
        b.textContent = "Pasta";
        b.title = "Mostrar na pasta Downloads";
        b.dataset.path = it.path;
        row.appendChild(b);
      }
      list.appendChild(row);
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
