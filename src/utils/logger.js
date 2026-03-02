"use strict";

/**
 * Logger de erros em arquivo (um por dia em LOG_DIR). Classifica erros com rótulos legíveis.
 * LOG_DIR vem do config (AppData); fallback para tmpdir — não exige administrador.
 * @module utils/logger
 */

const fs = require("fs");
const path = require("path");
const config = require("../config/app.config");

const LOG_DIR = config.LOG_DIR || path.join(require("os").tmpdir(), "captura-unificada", "logs");
let dirChecked = false;

/**
 * Classifica o erro e retorna um rótulo curto para o log (ex.: INTERNET DESCONECTADA, ARQUIVO NÃO EXISTE).
 * @param {Error|string} err
 * @returns {string}
 */
function classifyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof Error && "code" in err ? String(err.code) : "";
  const s = (msg + " " + code).toLowerCase();

  if (s.includes("err_internet_disconnected") || s.includes("net::err_internet_disconnected")) return "INTERNET DESCONECTADA";
  if (s.includes("enoent") || s.includes("arquivo não encontrado") || s.includes("no such file")) return "ARQUIVO NÃO EXISTE";
  if (s.includes("err_name_not_resolved") || s.includes("getaddrinfo enotfound")) return "NOME NÃO RESOLVIDO (DNS)";
  if (s.includes("err_connection_refused") || s.includes("econnrefused")) return "CONEXÃO RECUSADA";
  if (s.includes("err_connection_timed_out") || s.includes("etimedout")) return "TIMEOUT DE CONEXÃO";
  if (s.includes("err_address_unreachable") || s.includes("enotreachable")) return "ENDEREÇO INACESSÍVEL";
  if (s.includes("err_failed") || s.includes("net::err_")) return "FALHA DE REDE";
  if (s.includes("eacces") || s.includes("eperm")) return "ACESSO NEGADO";
  if (s.includes("certificate") || s.includes("ssl") || s.includes("tls")) return "ERRO DE CERTIFICADO/SSL";

  return "ERRO";
}

/**
 * Garante que o diretório de logs existe.
 */
function ensureDir() {
  if (dirChecked) return;
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    dirChecked = true;
  } catch (err) {
    dirChecked = true;
    console.error("[logger] Não foi possível criar diretório de logs:", err.message);
  }
}

/**
 * Retorna o caminho do arquivo de log do dia (YYYY-MM-DD.log).
 */
function getLogFilePath() {
  const now = new Date();
  const dateStr =
    String(now.getFullYear()) +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `${dateStr}.log`);
}

/**
 * Formata horário atual como HH:mm:ss.
 */
function timeStr() {
  const now = new Date();
  return (
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0") +
    ":" +
    String(now.getSeconds()).padStart(2, "0")
  );
}

/**
 * Grava uma linha de erro no arquivo do dia (apenas anexa, com horário e rótulo quando aplicável).
 * @param {string|Error} message - Mensagem de erro ou instância de Error (usa message + stack)
 */
function logError(message) {
  ensureDir();
  const ts = timeStr();
  const label = classifyError(message);
  let detail;
  if (message instanceof Error) {
    detail = message.message + (message.stack ? " | " + message.stack.replace(/\r?\n/g, " | ") : "");
  } else {
    detail = String(message);
  }
  const line = `${label} [${ts}] ${detail}\n`;
  const filePath = getLogFilePath();
  try {
    fs.appendFileSync(filePath, line, "utf8");
  } catch (err) {
    console.error("[logger] Falha ao escrever log:", err.message);
  }
}

/**
 * Inicializa captura global de erros não tratados (main process).
 * Erros vão só para o log; não exibe diálogo nem encerra o processo.
 */
function initGlobalHandlers() {
  process.on("uncaughtException", (err) => {
    logError(err);
  });
  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason : String(reason);
    logError(msg);
  });
}

module.exports = {
  logError,
  initGlobalHandlers,
  getLogDir: () => LOG_DIR,
};
