/**
 * @fileoverview Serviço de integração com hardware (biometria, leitores)
 * @module services/hardware.service
 *
 * Responsabilidade: Configurar ambiente para CapturaWeb (Suprema) e
 * SMART (Griaule BCC, serviço Valid).
 */

const { exec } = require("child_process");
const { esperar } = require("../utils/helpers");
const config = require("../config/app.config");

/**
 * Configura o ambiente para o sistema SMART (CIN).
 * Para o serviço Valid, inicia o BCC da Griaule se não estiver rodando.
 */
async function configurarAmbienteSmart() {
  exec('sc stop "Valid-ServicoIntegracaoHardware"');
  await esperar(config.DELAYS.hardwareSwitch);

  exec('tasklist /FI "IMAGENAME eq BCC.exe"', (err, stdout) => {
    if (!stdout?.includes("BCC.exe")) {
      exec('start "" "C:\\Griaule\\BCC\\BCC.exe"');
    }
  });
}

/**
 * Configura o ambiente para o CapturaWeb.
 * Encerra BCC e Java, reinicia o leitor Suprema RealScan-D
 * e inicia o serviço Valid.
 */
async function configurarAmbienteCaptura() {
  exec("taskkill /F /IM BCC.exe /T");
  exec("taskkill /F /IM javaw.exe /T");
  await esperar(config.DELAYS.capturaEnv);

  const cmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false; Enable-PnpDevice -Confirm:$false"`;
  exec(cmd);
  await esperar(config.DELAYS.capturaEnv);

  exec('sc start "Valid-ServicoIntegracaoHardware"');
}

module.exports = {
  configurarAmbienteSmart,
  configurarAmbienteCaptura,
};
