/**
 * @fileoverview Serviço de configuração do Atende
 * @module services/atende.service
 *
 * Responsabilidade: Ler e gravar o endereço IP do Atende em arquivo
 * em C:/TOOLS. O arquivo persiste após atualizações do app.
 */

const fs = require("fs");
const path = require("path");
const config = require("../config/app.config");

/**
 * Retorna o caminho do arquivo de config do Atende (em C:/TOOLS).
 * @returns {string}
 */
function getConfigPath() {
  return path.join(config.ATENDE.CONFIG_DIR, config.ATENDE.CONFIG_FILE);
}

/**
 * Lê a configuração do Atende (IP ou URL) do arquivo em C:/TOOLS.
 * @returns {{ ip: string } | null} Objeto com ip/url ou null se não configurado
 */
function getAtendeConfig() {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return null;

    const content = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(content);
    const ip = (data?.ip || data?.url || "").trim();

    if (!ip) return null;
    return { ip };
  } catch (e) {
    return null;
  }
}

/**
 * Salva o IP ou URL do Atende no arquivo em C:/TOOLS.
 * Cria o diretório C:/TOOLS se não existir.
 * @param {string} ip - Endereço IP (ex: "192.168.1.100") ou URL completa (ex: "https://www.google.com")
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
    const data = { ip: ipClean };
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Erro ao salvar config Atende:", e);
    return false;
  }
}

/**
 * Monta a URL do Atende a partir do IP ou URL configurada.
 * Se o valor começar com http:// ou https://, usa como URL completa.
 * Caso contrário, usa o template http://{IP}/guiche.asp?auto=1
 * @param {string} ipOuUrl - IP (ex: 192.168.1.100) ou URL completa (ex: https://www.google.com)
 * @returns {string}
 */
function buildAtendeUrl(ipOuUrl) {
  const valor = (ipOuUrl || "").trim();
  if (valor.startsWith("http://") || valor.startsWith("https://")) {
    return valor;
  }
  return config.ATENDE.URL_TEMPLATE.replace("{IP}", valor);
}

module.exports = {
  getAtendeConfig,
  setAtendeConfig,
  buildAtendeUrl,
};
