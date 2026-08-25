"use strict";

/**
 * @fileoverview View - Renderização e atualização da interface (MVC). Apenas DOM.
 * @module core/view
 */

import { ELEMENT_IDS, CSS_CLASSES } from "../config/constants.js";
import { CATALOG, getCatalogItem } from "../config/catalog.js";
import { getRecents, getFavorites } from "./recents.js";

/**
 * Seletores dos elementos do DOM.
 * Usa funções para garantir acesso atualizado (DOM pode mudar).
 */
const elementos = {
  app: () => document.querySelector(".app"),
  loading: () => document.getElementById(ELEMENT_IDS.LOADING),
  loaderText: () => document.querySelector(`#${ELEMENT_IDS.LOADING} .loading-title`),
  loadingTitle: () => document.getElementById(ELEMENT_IDS.LOADING_TITLE),
  loadingSub: () => document.getElementById(ELEMENT_IDS.LOADING_SUB),
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
  commandPalette: () => document.getElementById(ELEMENT_IDS.COMMAND_PALETTE),
  commandInput: () => document.getElementById(ELEMENT_IDS.COMMAND_INPUT),
  commandList: () => document.getElementById(ELEMENT_IDS.COMMAND_LIST),
  systemError: () => document.getElementById(ELEMENT_IDS.SYSTEM_ERROR),
};

let cmdkIndex = 0;
let cmdkItems = [];

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function iconEl(name) {
  const i = document.createElement("i");
  i.className = `fas ${name}`;
  i.setAttribute("aria-hidden", "true");
  return i;
}

function emptyHint(text) {
  const p = document.createElement("p");
  p.className = "home-empty";
  p.textContent = text;
  return p;
}

const View = {
  elementos,

  /**
   * Exibe ou oculta o overlay de loading do launcher (troca de sistema).
   * @param {boolean} mostrar
   * @param {string} [nomeSistema=""] - Nome exibido no texto (ex: "CapturaWeb")
   */
  mostrarLoading(mostrar, nomeSistema = "") {
    const loader = this.elementos.loading();
    const title = this.elementos.loadingTitle() || this.elementos.loaderText();
    const sub = this.elementos.loadingSub();
    const contentArea = this.elementos.contentArea();

    if (loader) {
      if (mostrar) {
        this.ocultarErroSistema();
        loader.classList.remove(CSS_CLASSES.HIDDEN);
        loader.style.display = "";
        if (title) title.textContent = nomeSistema || "Sistema";
        if (sub) sub.textContent = nomeSistema ? `Preparando ${nomeSistema}…` : "Preparando ambiente…";
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
    const isHome = !btn || btn.id === ELEMENT_IDS.NAV_HOME;
    const placeholder = this.elementos.placeholder();
    if (isHome) {
      placeholder?.classList.remove(CSS_CLASSES.HIDDEN);
      this.elementos.placeholderOfflineMsg()?.classList.add(CSS_CLASSES.HIDDEN);
    } else {
      placeholder?.classList.add(CSS_CLASSES.HIDDEN);
      this.elementos.placeholderOfflineMsg()?.classList.add(CSS_CLASSES.HIDDEN);
    }
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
      toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
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

  setEmbedMode(on) {
    const app = this.elementos.app();
    app?.classList.toggle(CSS_CLASSES.EMBED, !!on);
  },

  setHomeActive() {
    this.setMenuAtivo(null);
    this.setEmbedMode(false);
    this.ocultarErroSistema();
    this.mostrarPlaceholderPadrao();
    this.renderHome();
  },

  atualizarSaudacao() {
    const el = document.getElementById(ELEMENT_IDS.HOME_GREETING);
    if (el) el.textContent = greetingText();
  },

  atualizarStatusLauncher() {
    const el = document.getElementById(ELEMENT_IDS.LAUNCHER_STATUS);
    if (!el) return;
    const n = CATALOG.length;
    el.textContent = n === 1 ? "1 sistema disponível" : `${n} sistemas disponíveis`;
  },

  makeSystemTile(item, { recent = false } = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "home-tile";
    btn.dataset.systemId = item.id;
    btn.setAttribute("aria-label", `Abrir ${item.nome}`);

    const icon = iconEl(item.icon);
    const copy = document.createElement("span");
    copy.className = "home-tile-copy";
    const name = document.createElement("strong");
    name.textContent = item.nome;
    const meta = document.createElement("span");
    meta.textContent = recent ? "Recente" : item.descricao || item.grupo;
    copy.append(name, meta);

    const action = document.createElement("span");
    action.className = "home-tile-action";
    action.textContent = item.janelaExterna ? "Janela" : "Abrir";

    btn.append(icon, copy, action);
    return btn;
  },

  renderHome() {
    this.atualizarSaudacao();
    this.atualizarStatusLauncher();

    const recentsEl = document.getElementById(ELEMENT_IDS.HOME_RECENTS);
    const favsEl = document.getElementById(ELEMENT_IDS.HOME_FAVORITES);
    const actionsEl = document.getElementById(ELEMENT_IDS.HOME_ACTIONS);
    if (!recentsEl || !favsEl || !actionsEl) return;

    recentsEl.replaceChildren();
    const recents = getRecents().map(getCatalogItem).filter(Boolean);
    if (!recents.length) recentsEl.appendChild(emptyHint("Nenhum acesso recente nesta estação."));
    else recents.forEach((item) => recentsEl.appendChild(this.makeSystemTile(item, { recent: true })));

    favsEl.replaceChildren();
    const favs = getFavorites().map(getCatalogItem).filter(Boolean);
    if (!favs.length) favsEl.appendChild(emptyHint("Marque sistemas usados com frequência."));
    else favs.forEach((item) => favsEl.appendChild(this.makeSystemTile(item)));

    actionsEl.replaceChildren();
    const actions = [
      { id: "copy-hostname", icon: "fa-desktop", label: "Copiar hostname" },
      { id: "copy-ip", icon: "fa-network-wired", label: "Copiar IP" },
      { id: "copy-anydesk", icon: "fa-id-card-clip", label: "Copiar AnyDesk" },
      { id: "open-downloads", icon: "fa-folder-open", label: "Abrir pasta de PDFs" },
    ];
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "home-action";
      b.dataset.actionId = a.id;
      b.append(iconEl(a.icon), document.createTextNode(a.label));
      actionsEl.appendChild(b);
    }
  },

  isCommandPaletteOpen() {
    const pal = this.elementos.commandPalette();
    return !!(pal && !pal.classList.contains(CSS_CLASSES.HIDDEN));
  },

  filterCatalog(query) {
    const q = String(query || "").trim().toLowerCase();
    const recents = getRecents();
    const items = [];
    if (!q && recents.length) {
      recents.forEach((id) => {
        const item = getCatalogItem(id);
        if (item) items.push({ ...item, group: "Recentes" });
      });
    }
    CATALOG.forEach((item) => {
      const hay = `${item.nome} ${item.descricao} ${item.grupo}`.toLowerCase();
      if (!q || hay.includes(q)) {
        if (!items.some((x) => x.id === item.id && x.group === "Recentes")) {
          items.push({ ...item, group: item.grupo });
        }
      }
    });
    return items;
  },

  renderCommandList(query = "") {
    const list = this.elementos.commandList();
    if (!list) return;
    cmdkItems = this.filterCatalog(query);
    cmdkIndex = cmdkItems.length ? 0 : -1;
    list.replaceChildren();
    let lastGroup = "";
    cmdkItems.forEach((item, idx) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        const g = document.createElement("div");
        g.className = "cmdk-group";
        g.textContent = lastGroup;
        list.appendChild(g);
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className = "cmdk-item";
      row.dataset.index = String(idx);
      row.dataset.id = item.id;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === cmdkIndex ? "true" : "false");
      const copy = document.createElement("span");
      copy.className = "cmdk-item-copy";
      const name = document.createElement("strong");
      name.textContent = item.nome;
      const desc = document.createElement("span");
      desc.textContent = item.descricao;
      copy.append(name, desc);
      row.append(iconEl(item.icon), copy);
      if (idx === cmdkIndex) row.classList.add("is-active");
      list.appendChild(row);
    });
    if (!cmdkItems.length) {
      list.appendChild(emptyHint("Nenhum sistema encontrado."));
    }
  },

  cmdkMove(delta) {
    if (!cmdkItems.length) return;
    cmdkIndex = (cmdkIndex + delta + cmdkItems.length) % cmdkItems.length;
    const list = this.elementos.commandList();
    list?.querySelectorAll(".cmdk-item").forEach((el) => {
      const active = Number(el.dataset.index) === cmdkIndex;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-selected", active ? "true" : "false");
      if (active) el.scrollIntoView({ block: "nearest" });
    });
  },

  cmdkSelectedId() {
    return cmdkItems[cmdkIndex]?.id || null;
  },

  setCommandPaletteOpen(open) {
    const pal = this.elementos.commandPalette();
    const input = this.elementos.commandInput();
    if (!pal) return;
    if (open) {
      pal.classList.remove(CSS_CLASSES.HIDDEN);
      this.renderCommandList("");
      if (input) {
        input.value = "";
        requestAnimationFrame(() => input.focus());
      }
    } else {
      pal.classList.add(CSS_CLASSES.HIDDEN);
    }
  },

  mostrarErroSistema(sistemaId) {
    const box = this.elementos.systemError();
    const title = document.getElementById(ELEMENT_IDS.SYSTEM_ERROR_TITLE);
    const item = getCatalogItem(sistemaId);
    const nome = item?.nome || "sistema";
    if (title) title.textContent = `Não foi possível iniciar o ${nome}`;
    box?.classList.remove(CSS_CLASSES.HIDDEN);
    this.elementos.placeholder()?.classList.add(CSS_CLASSES.HIDDEN);
  },

  ocultarErroSistema() {
    this.elementos.systemError()?.classList.add(CSS_CLASSES.HIDDEN);
  },

  marcarCopiado(btn) {
    if (!btn) return;
    btn.classList.add(CSS_CLASSES.COPIED);
    btn.title = "Copiado";
    const ico = btn.querySelector(".copy-ico");
    if (ico) ico.className = "fas fa-check copy-ico";
    setTimeout(() => {
      btn.classList.remove(CSS_CLASSES.COPIED);
      btn.title = "Copiar";
      if (ico) ico.className = "fas fa-copy copy-ico";
    }, 1200);
  },
};

export default View;
