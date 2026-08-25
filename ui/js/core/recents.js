"use strict";

const RECENTS_KEY = "captura-unificada.recents";
const FAVS_KEY = "captura-unificada.favorites";
const MAX_RECENTS = 8;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

export function getRecents() {
  return readJson(RECENTS_KEY, []).filter((id) => typeof id === "string");
}

export function pushRecent(id) {
  if (!id || id === "atende") return getRecents();
  const next = [id, ...getRecents().filter((x) => x !== id)].slice(0, MAX_RECENTS);
  writeJson(RECENTS_KEY, next);
  return next;
}

const DEFAULT_FAVORITES = Object.freeze(["captura", "smart", "ponto-valid"]);

export function getFavorites() {
  if (localStorage.getItem(FAVS_KEY) == null) return DEFAULT_FAVORITES.slice();
  return readJson(FAVS_KEY, []).filter((id) => typeof id === "string");
}

export function isFavorite(id) {
  return getFavorites().includes(id);
}

export function toggleFavorite(id) {
  if (!id) return getFavorites();
  const cur = getFavorites();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeJson(FAVS_KEY, next);
  return next;
}
