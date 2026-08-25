"use strict";

import { CATALOG } from "./config/catalog.js";

const root = document.getElementById("overlay-root");
const fab = document.getElementById("launcher-fab");
const fabIcon = document.getElementById("fab-icon");
const sidebar = document.getElementById("overlay-sidebar");
const backdrop = document.getElementById("overlay-backdrop");
const nav = document.getElementById("ov-nav");
const currentEl = document.getElementById("ov-current");
const versionEl = document.getElementById("ov-version");
const homeBtn = document.getElementById("ov-home");

let sidebarOpen = false;
let currentSistema = null;
let closeTimer = null;

function renderNav() {
  nav.replaceChildren();
  let lastGroup = "";
  for (const item of CATALOG) {
    if (item.grupo !== lastGroup) {
      lastGroup = item.grupo;
      const g = document.createElement("div");
      g.className = "ov-group";
      g.textContent = item.grupo;
      nav.appendChild(g);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ov-item hit";
    btn.dataset.id = item.id;
    const icon = document.createElement("i");
    icon.className = `fas ${item.icon}`;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = item.nome;
    btn.append(icon, label);
    btn.addEventListener("click", () => onOpenSystem(item.id));
    nav.appendChild(btn);
  }
  syncActive();
}

function syncActive() {
  nav.querySelectorAll(".ov-item").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.id === currentSistema);
  });
  const item = CATALOG.find((s) => s.id === currentSistema);
  currentEl.textContent = item ? item.nome : "Launcher";
}

async function setSidebarOpen(open) {
  const next = !!open;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  if (next) {
    await window.api.setOverlayChromeOpen(true);
    root.classList.add("is-expanded");
    sidebar.classList.remove("is-open");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    sidebarOpen = true;
    sidebar.classList.add("is-open");
    sidebar.setAttribute("aria-hidden", "false");
    backdrop.classList.remove("hidden");
    fab.classList.add("is-open");
    fab.setAttribute("aria-expanded", "true");
    fab.title = "Fechar menu do Launcher";
    fab.setAttribute("aria-label", fab.title);
    fabIcon.className = "fas fa-outdent";
    return;
  }

  sidebarOpen = false;
  sidebar.classList.remove("is-open");
  sidebar.setAttribute("aria-hidden", "true");
  backdrop.classList.add("hidden");
  fab.classList.remove("is-open");
  fab.setAttribute("aria-expanded", "false");
  fab.title = "Abrir menu do Launcher";
  fab.setAttribute("aria-label", fab.title);
  fabIcon.className = "fas fa-indent";
  closeTimer = setTimeout(() => {
    root.classList.remove("is-expanded");
    void window.api.setOverlayChromeOpen(false);
  }, 180);
}

async function onOpenSystem(id) {
  const item = CATALOG.find((s) => s.id === id);
  if (!item) return;
  void setSidebarOpen(false);
  if (id === "atende") {
    const result = await window.api.abrirAtende();
    if (result?.needsConfig) {
      await window.api.voltarHome();
      window.api.requestAtendeConfig();
    }
    return;
  }
  const map = {
    captura: () => window.api.abrirCaptura(),
    smart: () => window.api.abrirSmart(),
    s4ipm: () => window.api.abrirS4ipm(),
    "doc-avulsos": () => window.api.abrirDocAvulsos(),
    validacao: () => window.api.abrirValidacao(),
    "ponto-valid": () => window.api.abrirPontoValid(),
    "ponto-renova": () => window.api.abrirPontoRenova(),
  };
  const fn = map[id];
  if (fn) await fn();
}

fab.addEventListener("click", (e) => {
  e.stopPropagation();
  void setSidebarOpen(!sidebarOpen);
});

backdrop.addEventListener("click", () => void setSidebarOpen(false));
homeBtn.addEventListener("click", () => {
  void setSidebarOpen(false);
  window.api.voltarHome();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sidebarOpen) {
    e.preventDefault();
    void setSidebarOpen(false);
  }
});

window.api.onLoadFinished((sistema) => {
  currentSistema = sistema && sistema !== "atende" ? sistema : currentSistema;
  if (!sistema) currentSistema = null;
  syncActive();
  if (!sistema) void setSidebarOpen(false);
});

window.api.onOverlayState((payload) => {
  if (payload?.sistema) {
    currentSistema = payload.sistema;
    syncActive();
  }
  if (typeof payload?.open === "boolean") void setSidebarOpen(payload.open);
});

void window.api.getSystemInfo().then((info) => {
  if (info?.version && versionEl) versionEl.textContent = `v${info.version}`;
});

renderNav();
