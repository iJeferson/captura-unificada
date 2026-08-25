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
let station = { hostname: "---", ip: "---", anydesk: "---" };

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
    btn.title = item.nome;
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
    const active = el.dataset.id === currentSistema;
    el.classList.toggle("is-active", active);
    el.querySelector(".ov-tag")?.remove();
    if (active) {
      const tag = document.createElement("span");
      tag.className = "ov-tag";
      tag.textContent = "ATIVO";
      el.appendChild(tag);
    }
  });
  const item = CATALOG.find((s) => s.id === currentSistema);
  currentEl.textContent = item ? item.nome : "Captura Unificada";
}

let ignoringMouse = true;

function syncFabClickThrough(overFab) {
  if (!window.api?.setOverlayIgnoreMouse) return;
  const ignore = sidebarOpen ? false : !overFab;
  if (ignore === ignoringMouse) return;
  ignoringMouse = ignore;
  window.api.setOverlayIgnoreMouse(ignore);
}

async function setSidebarOpen(open) {
  const next = !!open;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  if (next) {
    await window.api.setOverlayChromeOpen(true);
    ignoringMouse = false;
    root.classList.add("is-expanded");
    sidebar.classList.remove("is-open");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    sidebarOpen = true;
    syncFabClickThrough(true);
    sidebar.classList.add("is-open");
    sidebar.setAttribute("aria-hidden", "false");
    backdrop.classList.remove("hidden");
    fab.classList.add("is-open");
    fab.setAttribute("aria-expanded", "true");
    fab.title = "Recolher menu";
    fab.setAttribute("aria-label", fab.title);
    fabIcon.className = "fas fa-angles-left";
    return;
  }

  sidebarOpen = false;
  sidebar.classList.remove("is-open");
  sidebar.setAttribute("aria-hidden", "true");
  backdrop.classList.add("hidden");
  fab.classList.remove("is-open");
  fab.setAttribute("aria-expanded", "false");
  fab.title = "Expandir menu";
  fab.setAttribute("aria-label", fab.title);
  fabIcon.className = "fas fa-angles-right";
  closeTimer = setTimeout(() => {
    root.classList.remove("is-expanded");
    void window.api.setOverlayChromeOpen(false);
    ignoringMouse = true;
    syncFabClickThrough(!!fab.matches(":hover"));
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

async function copyStation(key, btn) {
  const value = String(station[key] || "").trim();
  if (!value || value === "---") return;
  const ok = await window.api.copyText(value);
  if (!ok || !btn) return;
  btn.title = "Copiado";
  setTimeout(() => {
    btn.title = "Copiar";
  }, 1200);
}

fab.addEventListener("click", (e) => {
  e.stopPropagation();
  void setSidebarOpen(!sidebarOpen);
});

fab.addEventListener("mouseenter", () => syncFabClickThrough(true));
fab.addEventListener("mouseleave", () => syncFabClickThrough(false));
document.addEventListener("mousemove", (e) => {
  if (sidebarOpen) return;
  syncFabClickThrough(!!e.target.closest?.("#launcher-fab"));
});

backdrop.addEventListener("click", () => void setSidebarOpen(false));
homeBtn.addEventListener("click", () => {
  void setSidebarOpen(false);
  window.api.voltarHome();
});

document.getElementById("ov-station")?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-copy]");
  if (btn?.dataset?.copy) void copyStation(btn.dataset.copy, btn);
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

window.api.onUpdateIP?.((ip) => {
  station.ip = ip;
  const el = document.getElementById("ov-ip");
  if (el) el.textContent = ip;
});

void window.api.getSystemInfo().then((info) => {
  station = {
    hostname: info?.hostname || "---",
    ip: info?.ip || "---",
    anydesk: info?.anydesk || "---",
  };
  if (info?.version && versionEl) versionEl.textContent = `v${info.version}`;
  const host = document.getElementById("ov-hostname");
  const ip = document.getElementById("ov-ip");
  const any = document.getElementById("ov-anydesk");
  if (host) host.textContent = station.hostname;
  if (ip) ip.textContent = station.ip;
  if (any) any.textContent = station.anydesk;
});

renderNav();
