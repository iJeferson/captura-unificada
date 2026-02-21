/**
 * @fileoverview Serviço de informações do sistema
 * @module services/system.service
 *
 * Responsabilidade: Coletar hostname, IP, versão do app e ID AnyDesk.
 */

const os = require("os");
const { app } = require("electron");
const { obterAnydeskID } = require("../utils/helpers");

/**
 * Retorna as informações do sistema para exibição na UI.
 * @returns {Object} Objeto com hostname, ip, anydesk e version
 */
function getSystemInfo() {
  const ip =
    Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i.family === "IPv4" && !i.internal)?.address || "127.0.0.1";

  return {
    hostname: os.hostname(),
    ip,
    anydesk: obterAnydeskID(),
    version: app.getVersion(),
  };
}

module.exports = { getSystemInfo };
