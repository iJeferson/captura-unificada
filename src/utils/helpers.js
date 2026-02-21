/**
 * @fileoverview Funções utilitárias do Main Process
 * @module utils/helpers
 *
 * Responsabilidade: Helpers reutilizáveis (delay, leitura de arquivos, etc.)
 */

const fs = require("fs");
const config = require("../config/app.config");

/**
 * Aguarda um tempo determinado em milissegundos.
 * @param {number} ms - Tempo em milissegundos
 * @returns {Promise<void>}
 */
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Obtém o ID do AnyDesk instalado no sistema.
 * Busca em arquivos de configuração do AnyDesk (service.conf, system.conf).
 * @returns {string} ID do AnyDesk ou "---" se não encontrado
 */
function obterAnydeskID() {
  try {
    for (const caminho of config.ANYDESK_PATHS) {
      if (fs.existsSync(caminho)) {
        const conteudo = fs.readFileSync(caminho, "utf8");
        const match = conteudo.match(/(?:ad\.anydesk\.id|id)=(\d+)/);
        if (match) return match[1];
      }
    }
    return "---";
  } catch (e) {
    return "Erro";
  }
}

module.exports = {
  esperar,
  obterAnydeskID,
};
