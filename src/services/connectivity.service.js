"use strict";

/**
 * Serviço de verificação de conectividade (Main Process).
 * A rede do posto vale se algum sistema configurado responder.
 * Não usa ping (ICMP para 8.8.8.8 é bloqueado em várias redes de governo).
 * Não exige administrador.
 * @module services/connectivity.service
 */

const http = require("http");
const https = require("https");
const config = require("../config/app.config");
const logger = require("../utils/logger");

const CONNECTIVITY = config.CONNECTIVITY || {
  intervalMs: 7000,
  timeoutMs: 8000,
  consecutiveNeeded: 2,
  consecutiveNeededForOnline: 2,
  minOfflineDurationMs: 6000,
};
const consecutiveForOnline = Math.max(1, CONNECTIVITY.consecutiveNeededForOnline ?? 2);

/**
 * Queda da rede inteira, não de um endereço.
 * -106 ERR_INTERNET_DISCONNECTED, -130 ERR_PROXY_CONNECTION_FAILED.
 */
const QUEDA_GERAL = new Set([-106, -130]);

/**
 * O endereço deste sistema não abriu. A rede do posto pode continuar válida.
 * -2 ERR_FAILED, -21 ERR_NETWORK_CHANGED, -22 ERR_BLOCKED_BY_ADMINISTRATOR,
 * -100 ERR_CONNECTION_CLOSED, -101 ERR_CONNECTION_RESET, -102 ERR_CONNECTION_REFUSED,
 * -104 ERR_CONNECTION_FAILED, -105 ERR_NAME_NOT_RESOLVED, -109 ERR_ADDRESS_UNREACHABLE,
 * -111 ERR_TUNNEL_CONNECTION_FAILED, -118 ERR_CONNECTION_TIMED_OUT, -137 ERR_NAME_RESOLUTION_FAILED.
 */
const DESTINO_INALCANCAVEL = new Set([
  -2, -21, -22, -100, -101, -102, -104, -105, -109, -111, -118, -137,
]);

let getMainWindow = null;
let onReconnectCallback = null;
let onDisconnectCallback = null;
let intervalId = null;
let consecutiveOk = 0;
let consecutiveFail = 0;
let lastSent = null;
let lastLoggedConnectivity = null;
/** Timestamp do primeiro falha da sequência atual (para tempo mínimo offline). */
let firstFailTime = null;
/** Timer de offline atrasado (falha de carga): só envia após minOfflineDurationMs. */
let pendingOfflineTimer = null;
/** Recheck rápido quando o primeiro sucesso ocorre após estar offline (reconhece volta da internet mais cedo). */
let fastRecheckTimerId = null;
const minOfflineMs = CONNECTIVITY.minOfflineDurationMs ?? 5000;
const FAST_RECHECK_MS = 2500;

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
 * Registra em log apenas transições de conectividade (sem spam por tentativa).
 * @param {boolean} online
 */
function logConnectivityTransition(online) {
  if (lastLoggedConnectivity === online) return;
  lastLoggedConnectivity = online;
  if (online) {
    logger.logInfo("CONNECTIVITY_RESTORED", "Conectividade com a internet restabelecida.");
  } else {
    logger.logWarn("CONNECTIVITY_LOST", "Conectividade com a internet perdida.");
  }
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
    if (fastRecheckTimerId) {
      clearTimeout(fastRecheckTimerId);
      fastRecheckTimerId = null;
    }
    firstFailTime = null;
    consecutiveOk++;
    consecutiveFail = 0;
    if (lastSent === null) {
      lastSent = true;
      wc.send("connectivity-change", true);
    } else if (consecutiveOk >= consecutiveForOnline && lastSent !== true) {
      const wasOffline = lastSent === false;
      lastSent = true;
      logConnectivityTransition(true);
      wc.send("connectivity-change", true);
      if (wasOffline && onReconnectCallback) {
        try { onReconnectCallback(); } catch (_) {}
      }
    } else if (lastSent === false && consecutiveOk === 1) {
      fastRecheckTimerId = setTimeout(() => {
        fastRecheckTimerId = null;
        requestCheck();
      }, FAST_RECHECK_MS);
    }
    return;
  }

  if (fastRecheckTimerId) {
    clearTimeout(fastRecheckTimerId);
    fastRecheckTimerId = null;
  }
  consecutiveFail++;
  consecutiveOk = 0;
  if (consecutiveFail === 1) firstFailTime = Date.now();

  const elapsed = firstFailTime !== null ? Date.now() - firstFailTime : 0;
  const minElapsed = elapsed >= minOfflineMs;

  if (consecutiveFail >= CONNECTIVITY.consecutiveNeeded && lastSent !== false) {
    if (minOfflineMs <= 0 || minElapsed) {
      const jaOffline = lastSent === false;
      lastSent = false;
      logConnectivityTransition(false);
      wc.send("connectivity-change", false);
      if (!jaOffline && onDisconnectCallback) {
        try { onDisconnectCallback(); } catch (_) {}
      }
    }
  }
}

/** Origem que respondeu por último. A próxima verificação começa por ela. */
let origemAlcance = null;
/** Sonda em andamento, compartilhada entre o timer e a falha de carga. */
let sondaAtual = null;

/**
 * Origens HTTP(S) dos sistemas configurados, sem repetir host.
 * Não inclui 8.8.8.8 nem serviços públicos genéricos: em rede de governo
 * esses destinos são filtrados mesmo com os sistemas do posto liberados.
 * @param {Record<string, string>|null|undefined} urls
 * @returns {string[]}
 */
function origensDeConectividade(urls) {
  const lista = [];
  const vistos = new Set();
  for (const valor of Object.values(urls || {})) {
    if (typeof valor !== "string" || !valor.trim()) continue;
    let parsed;
    try {
      parsed = new URL(valor);
    } catch (_) {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (vistos.has(parsed.origin)) continue;
    vistos.add(parsed.origin);
    lista.push(parsed.origin);
  }
  return lista;
}

/**
 * Resposta, certificado ou recusa da porta indicam que a rede chegou no destino.
 * Timeout, DNS e "sem internet" não.
 * @param {Error|string|null|undefined} err
 * @returns {boolean}
 */
function resultadoIndicaAlcance(err) {
  const bruto = `${err && err.code ? err.code : ""} ${err && err.message ? err.message : err || ""}`.toUpperCase();
  if (/CERT|SSL|TLS|ECONNREFUSED|CONNECTION_REFUSED|CONNECTION_RESET|EMPTY_RESPONSE/.test(bruto)) return true;
  return false;
}

/**
 * @param {number} errorCode
 * @returns {boolean}
 */
function ehQuedaGeral(errorCode) {
  return QUEDA_GERAL.has(errorCode);
}

/**
 * @param {number} errorCode
 * @returns {boolean}
 */
function ehDestinoInalcancavel(errorCode) {
  return DESTINO_INALCANCAVEL.has(errorCode) || QUEDA_GERAL.has(errorCode);
}

function redeElectron() {
  try {
    const electron = require("electron");
    if (electron && electron.net && typeof electron.net.request === "function") return electron.net;
  } catch (_) {}
  return null;
}

/**
 * @param {string} origem
 * @returns {Promise<boolean>}
 */
function sondarOrigem(origem) {
  const timeoutMs = Math.max(1000, CONNECTIVITY.timeoutMs || 4000);
  const net = redeElectron();
  if (net) return sondarComElectron(net, origem, timeoutMs);
  return sondarComNode(origem, timeoutMs);
}

function sondarComElectron(net, origem, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { req.abort(); } catch (_) {}
      resolve(ok);
    };
    let req;
    try {
      req = net.request({ method: "GET", url: origem });
    } catch (_) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => finish(false), timeoutMs);
    req.on("response", (res) => {
      res.on("data", () => {});
      res.on("end", () => {});
      finish(true);
    });
    req.on("error", (err) => finish(resultadoIndicaAlcance(err)));
    req.end();
  });
}

function sondarComNode(origem, timeoutMs) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(origem);
    } catch (_) {
      resolve(false);
      return;
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        method: "GET",
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: "/",
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", (err) => resolve(resultadoIndicaAlcance(err)));
    req.end();
  });
}

function lembrarOrigem(origem) {
  if (!origem || origemAlcance === origem) return;
  origemAlcance = origem;
  logger.logInfo("CONNECTIVITY_HOST", `Rede confirmada em ${origem}.`);
}

/**
 * @param {string[]} origens
 * @returns {Promise<string|null>}
 */
function primeiraQueAlcanca(origens) {
  if (!origens.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pendentes = origens.length;
    let resolvido = false;
    const terminar = (origem) => {
      if (resolvido) return;
      if (origem) {
        resolvido = true;
        resolve(origem);
        return;
      }
      pendentes -= 1;
      if (pendentes <= 0) {
        resolvido = true;
        resolve(null);
      }
    };
    for (const origem of origens) {
      sondarOrigem(origem).then((ok) => terminar(ok ? origem : null));
    }
  });
}

/**
 * Online se qualquer sistema configurado responder.
 * @returns {Promise<boolean>}
 */
async function algumaOrigemAlcanca() {
  const origens = origensDeConectividade(config.URLS);
  if (origens.length === 0) return true;
  const preferida = origemAlcance && origens.includes(origemAlcance) ? origemAlcance : null;
  if (preferida && (await sondarOrigem(preferida))) {
    lembrarOrigem(preferida);
    return true;
  }
  const achou = await primeiraQueAlcanca(origens.filter((origem) => origem !== preferida));
  if (achou) {
    lembrarOrigem(achou);
    return true;
  }
  return false;
}

function obterSonda() {
  if (!sondaAtual) {
    const promessa = algumaOrigemAlcanca().finally(() => {
      if (sondaAtual === promessa) sondaAtual = null;
    });
    sondaAtual = promessa;
  }
  return sondaAtual;
}

/**
 * Executa uma verificação e notifica o renderer.
 */
function checkAndNotify() {
  const win = typeof getMainWindow === "function" ? getMainWindow() : null;
  const wc = win?.webContents;
  if (!wc || wc.isDestroyed()) return;

  obterSonda()
    .then((online) => {
      if (wc.isDestroyed()) return;
      sendIfStable(wc, online);
    })
    .catch(() => {
      if (!wc.isDestroyed()) sendIfStable(wc, false);
    });
}

/**
 * Sonda agora e devolve se a rede do posto responde.
 * Usado quando um sistema falha com cara de queda geral.
 * @returns {Promise<boolean>}
 */
function confirmarRede() {
  const win = typeof getMainWindow === "function" ? getMainWindow() : null;
  const wc = win?.webContents;
  return obterSonda().then((online) => {
    if (wc && !wc.isDestroyed()) sendIfStable(wc, online);
    return online;
  });
}

/**
 * Inicia a verificação periódica de conectividade.
 * @param {() => import('electron').BrowserWindow | null} getWindow - Função que retorna a janela principal atual
 */
function start(getWindow, onReconnect, onDisconnect) {
  if (intervalId) return;
  getMainWindow = getWindow;
  onReconnectCallback = typeof onReconnect === "function" ? onReconnect : null;
  onDisconnectCallback = typeof onDisconnect === "function" ? onDisconnect : null;
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
  sendOfflineToRenderer();
  if (lastSent !== null) {
    logConnectivityTransition(false);
  }
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
  if (fastRecheckTimerId) {
    clearTimeout(fastRecheckTimerId);
    fastRecheckTimerId = null;
  }
  getMainWindow = null;
  onReconnectCallback = null;
  onDisconnectCallback = null;
  lastSent = null;
  lastLoggedConnectivity = null;
  consecutiveOk = 0;
  consecutiveFail = 0;
  firstFailTime = null;
  origemAlcance = null;
  sondaAtual = null;
}

/**
 * Retorna true se a falha de carga é de destino ou de rede.
 * @param {number} errorCode
 * @returns {boolean}
 */
function isNetworkError(errorCode) {
  return ehDestinoInalcancavel(errorCode);
}

module.exports = {
  start,
  requestCheck,
  confirmarRede,
  notifyOffline,
  reset,
  isNetworkError,
  ehQuedaGeral,
  ehDestinoInalcancavel,
  origensDeConectividade,
  resultadoIndicaAlcance,
};
