"use strict";

/**
 * @fileoverview Serviço do Atende: leitura/gravação do IP e tema em AppData (sem necessidade de admin).
 * @module services/atende.service
 */

const fs = require("fs");
const path = require("path");
const config = require("../config/app.config");
const logger = require("../utils/logger");

/**
 * Retorna o caminho do arquivo de config do Atende (em AppData do usuário).
 * @returns {string}
 */
function getConfigPath() {
  return path.join(config.ATENDE.CONFIG_DIR, config.ATENDE.CONFIG_FILE);
}

/**
 * Garante que o valor salvo tenha pelo menos o protocolo http (ou https se o usuário digitou).
 * @param {string} valor
 * @returns {string}
 */
function normalizeUrl(valor) {
  const s = (valor || "").trim();
  if (!s) return s;
  if (s.toLowerCase().startsWith("https://")) return s;
  if (s.toLowerCase().startsWith("http://")) return s;
  return "http://" + s;
}

/**
 * Lê a configuração do Atende (IP/URL e tema) do arquivo.
 * @returns {{ ip?: string, theme?: "dark"|"light" } | null}
 */
function getAtendeConfig() {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return null;

    const content = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(content);
    const ip = (data?.ip || data?.url || "").trim();
    const theme = data?.theme === "light" ? "light" : data?.theme === "dark" ? "dark" : undefined;

    return { ip: ip || undefined, theme };
  } catch (e) {
    return null;
  }
}

/**
 * Salva o IP ou URL do Atende exatamente como o usuário digitou.
 * Preserva o tema já salvo no arquivo.
 * Para só IP/host (ex: 192.168.1.1), na abertura usamos o template com http e /guiche.asp?auto=1.
 * Para URL completa (ex: http://servidor/pagina.asp), usamos como está, sem acrescentar nada.
 * @param {string} ip - Endereço IP ou URL (digite com http se for URL completa)
 * @returns {boolean} true se salvou com sucesso
 */
function setAtendeConfig(ip) {
  try {
    const ipClean = (ip || "").trim();
    if (!ipClean) return false;

    const configDir = config.ATENDE.CONFIG_DIR;
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = getConfigPath();
    const current = getAtendeConfig();
    const data = {
      ip: ipClean,
      theme: current?.theme || "dark",
    };
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    logger.logError(e);
    return false;
  }
}

/**
 * Salva apenas o tema (dark/light) no arquivo, mantendo o IP existente.
 * @param {"dark"|"light"} theme
 * @returns {boolean}
 */
function setTheme(theme) {
  try {
    const configPath = getConfigPath();
    const configDir = config.ATENDE.CONFIG_DIR;
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const current = getAtendeConfig();
    const data = {
      ip: (current?.ip || "").trim() || "",
      theme: theme === "light" ? "light" : "dark",
    };
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    logger.logError(e);
    return false;
  }
}

/**
 * Monta a URL do Atende a partir do IP ou URL configurada.
 * Se o usuário informou URL completa (http/https), usa como está, sem acrescentar nada.
 * Se informou só IP ou host, usa o template http://{IP}/guiche.asp?auto=1.
 * @param {string} ipOuUrl - IP (ex: "192.168.1.1") ou URL completa (ex: "http://192.168.1.1/guiche.asp?auto=1")
 * @returns {string}
 */
function buildAtendeUrl(ipOuUrl) {
  const valor = (ipOuUrl || "").trim();
  if (!valor) return "";

  if (valor.startsWith("http://") || valor.startsWith("https://")) {
    return valor;
  }
  return config.ATENDE.URL_TEMPLATE.replace("{IP}", valor);
}

module.exports = {
  getAtendeConfig,
  setAtendeConfig,
  setTheme,
  buildAtendeUrl,
};
