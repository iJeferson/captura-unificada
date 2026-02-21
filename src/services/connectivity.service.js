"use strict";

/**
 * Serviço de verificação de conectividade (Main Process).
 * Envia estado online/offline ao renderer com histerese para evitar piscar.
 * @module services/connectivity.service
 */

const https = require("https");
const config = require("../config/app.config");
const logger = require("../utils/logger");

const CONNECTIVITY = config.CONNECTIVITY || {
  checkUrl: "https://www.google.com/generate_204",
  intervalMs: 5000,
  timeoutMs: 5000,
  consecutiveNeeded: 2,
  minOfflineDurationMs: 5000,
};

/**
 * Códigos de erro de rede do Chromium (did-fail-load).
 * Quando o contentView falha com um destes códigos, a aplicação:
 * - Oculta a área de conteúdo (evita tela em branco)
 * - Marca estado como offline e envia "content-load-failed" ao renderer
 * - O renderer exibe o banner "Você está offline" e o placeholder com instrução
 *
 * Mapeamento: -2 ERR_FAILED | -6 ERR_INTERNET_DISCONNECTED | -105 ERR_NAME_NOT_RESOLVED
 *             -106 ERR_CONNECTION_REFUSED | -109 ERR_ADDRESS_UNREACHABLE | -118 ERR_CONNECTION_TIMED_OUT
 *
 * O Electron ainda pode imprimir "Failed to load URL" no terminal; o comportamento na UI está tratado.
 */
const NETWORK_ERROR_CODES = Object.freeze([
  -2, -6, -105, -106, -109, -118,
]);

let getMainWindow = null;
let intervalId = null;
let consecutiveOk = 0;
let consecutiveFail = 0;
let lastSent = null;
/** Timestamp do primeiro falha da sequência atual (para tempo mínimo offline). */
let firstFailTime = null;
/** Timer de offline atrasado (falha de carga): só envia após minOfflineDurationMs. */
let pendingOfflineTimer = null;
const minOfflineMs = CONNECTIVITY.minOfflineDurationMs ?? 5000;

/**
 * Envia estado offline ao renderer (content-load-failed + connectivity-change).
 * Usado após o tempo mínimo sem conexão (periódico ou falha de carga).
 */
function sendOfflineToRenderer() {
  if (pendingOfflineTimer) {
    clearTimeout(pendingOfflineTimer);
    pendingOfflineTimer = null;
  }
  lastSent = false;
  consecutiveFail = CONNECTIVITY.consecutiveNeeded;
  consecutiveOk = 0;

  const win = typeof getMainWindow === "function" ? getMainWindow() : null;
  const wc = win?.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send("content-loading-state", false);
  wc.send("connectivity-change", false);
  wc.send("content-load-failed");
}

/**
 * Envia o estado ao renderer apenas quando estável (N resultados iguais).
 * Offline só é enviado após minOfflineDurationMs sem conexão (evita piscar por cache/navegador).
 * @param {import('electron').WebContents} wc
 * @param {boolean} online
 */
function sendIfStable(wc, online) {
  if (!wc || wc.isDestroyed()) return;

  if (online) {
    if (pendingOfflineTimer) {
      clearTimeout(pendingOfflineTimer);
      pendingOfflineTimer = null;
    }
    firstFailTime = null;
    consecutiveOk++;
    consecutiveFail = 0;
    if (consecutiveOk >= CONNECTIVITY.consecutiveNeeded && lastSent !== true) {
      lastSent = true;
      wc.send("connectivity-change", true);
    }
    return;
  }

  consecutiveFail++;
  consecutiveOk = 0;
  if (consecutiveFail === 1) firstFailTime = Date.now();

  const elapsed = firstFailTime !== null ? Date.now() - firstFailTime : 0;
  const minElapsed = elapsed >= minOfflineMs;

  if (lastSent === null) {
    if (minOfflineMs <= 0 || minElapsed) {
      lastSent = false;
      wc.send("connectivity-change", false);
    }
    return;
  }

  if (consecutiveFail >= CONNECTIVITY.consecutiveNeeded && lastSent !== false) {
    if (minOfflineMs <= 0 || minElapsed) {
      lastSent = false;
      wc.send("connectivity-change", false);
    }
  }
}

/**
 * Executa uma verificação HTTP e notifica o renderer.
 */
function checkAndNotify() {
  const win = typeof getMainWindow === "function" ? getMainWindow() : null;
  const wc = win?.webContents;
  if (!wc || wc.isDestroyed()) return;

  const req = https.get(CONNECTIVITY.checkUrl, () => sendIfStable(wc, true));
  req.setTimeout(CONNECTIVITY.timeoutMs, () => {
    req.destroy();
    sendIfStable(wc, false);
  });
  req.on("error", (err) => {
    logger.logError(err);
    sendIfStable(wc, false);
  });
}

/**
 * Inicia a verificação periódica de conectividade.
 * @param {() => import('electron').BrowserWindow | null} getWindow - Função que retorna a janela principal atual
 */
function start(getWindow) {
  if (intervalId) return;
  getMainWindow = getWindow;
  checkAndNotify();
  intervalId = setInterval(checkAndNotify, CONNECTIVITY.intervalMs);
}

/**
 * Executa uma verificação imediata (ex.: solicitada pelo renderer ao iniciar).
 */
function requestCheck() {
  checkAndNotify();
}

/**
 * Agenda notificação de offline após minOfflineDurationMs (falha de carga da URL).
 * Evita tratar como offline por instantes de cache/navegador; se a conexão voltar antes, o timer é cancelado.
 */
function notifyOffline() {
  if (pendingOfflineTimer) return;
  pendingOfflineTimer = setTimeout(() => {
    pendingOfflineTimer = null;
    sendOfflineToRenderer();
  }, minOfflineMs);
}

/**
 * Reseta o estado ao fechar a janela principal (permite novo start ao recriar).
 */
function reset() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (pendingOfflineTimer) {
    clearTimeout(pendingOfflineTimer);
    pendingOfflineTimer = null;
  }
  getMainWindow = null;
  lastSent = null;
  consecutiveOk = 0;
  consecutiveFail = 0;
  firstFailTime = null;
}

/**
 * Retorna true se errorCode é de falha de rede (para did-fail-load).
 * @param {number} errorCode
 * @returns {boolean}
 */
function isNetworkError(errorCode) {
  return NETWORK_ERROR_CODES.includes(errorCode);
}

module.exports = {
  start,
  requestCheck,
  notifyOffline,
  reset,
  isNetworkError,
};
