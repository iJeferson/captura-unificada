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

  if (s.includes("command failed") || s.includes("command failed:")) return "COMANDO FALHOU";
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
 * Extrai comando e saída de erro de um Error de exec (child_process).
 * Node.js anexa cmd, stderr e stdout ao Error. Se não existirem, parseia a message.
 * @param {Error} err
 * @returns {{ command: string|null, output: string|null }|null}
 */
function parseExecError(err) {
  if (!(err instanceof Error)) return null;
  const msg = err.message || "";
  if (!msg.includes("Command failed")) return null;

  let command = err.cmd != null ? String(err.cmd).trim() : null;
  let output = err.stderr != null ? String(err.stderr).trim() : null;

  if (!command || !output) {
    const prefix = "Command failed:";
    const rest = msg.startsWith(prefix) ? msg.slice(prefix.length).trim() : msg;
    const parts = rest.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0 && !command) command = parts[0];
    if (parts.length > 1 && !output) output = parts.slice(1).join("\n");
  }
  if (!output && err.stdout) output = String(err.stdout).trim();
  return { command, output };
}

/**
 * Formata o stack trace de forma compacta (apenas primeiras linhas relevantes).
 * @param {string} stack
 * @param {number} maxLines
 * @returns {string}
 */
function formatStack(stack, maxLines = 3) {
  if (!stack || typeof stack !== "string") return "";
  const lines = stack.split(/\r?\n/).filter((l) => l.trim());
  const skipFirst = lines[0] && lines[0].includes("Error");
  const start = skipFirst ? 1 : 0;
  const relevant = lines.slice(start, start + maxLines);
  return relevant.map((l) => "    " + l.trim()).join("\n");
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
 * Formata o conteúdo do log de forma organizada (evita duplicação e bagunça).
 * @param {string|Error} message
 * @returns {string}
 */
function formatLogContent(message) {
  const ts = timeStr();
  const label = classifyError(message);

  const parsed = message instanceof Error ? parseExecError(message) : null;
  if (parsed && (parsed.command || parsed.output)) {
    const lines = [`[${label}] [${ts}]`, ""];
    if (parsed.command) lines.push(`  Comando: ${parsed.command}`);
    if (parsed.output) {
      const outputLines = parsed.output.split(/\r?\n/).filter((l) => l.trim());
      lines.push(`  Saída: ${outputLines[0] || "(vazio)"}`);
      for (let i = 1; i < outputLines.length; i++) {
        lines.push(`         ${outputLines[i]}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  if (message instanceof Error) {
    const lines = [`[${label}] [${ts}] ${message.message}`, ""];
    if (message.stack) {
      const stack = formatStack(message.stack);
      if (stack) lines.push(stack);
    }
    return lines.join("\n") + "\n";
  }

  return `[${label}] [${ts}] ${String(message)}\n`;
}

/**
 * Grava um erro no arquivo do dia (formato organizado, sem duplicação).
 * @param {string|Error} message - Mensagem de erro ou instância de Error
 */
function logError(message) {
  ensureDir();
  const content = formatLogContent(message);
  const filePath = getLogFilePath();
  try {
    fs.appendFileSync(filePath, content + "\n", "utf8");
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
};
