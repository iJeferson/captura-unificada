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

const SERVICO_HARDWARE = "Valid-ServicoIntegracaoHardware";

/**
 * Reinicia o serviço de hardware Valid (net stop + net start).
 * Usado antes de abrir a URL do CapturaWeb e no botão "Reiniciar Serviço de Hardware".
 */
async function reiniciarServicoHardware() {
  exec(`net stop "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
  exec(`net start "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
}

/**
 * Mata o processo BCC e inicia novamente.
 * Usado no botão "Reiniciar BCC" do SMART (CIN).
 */
async function reiniciarBCC() {
  exec("taskkill /F /IM BCC.exe /T");
  await esperar(config.DELAYS.hardwareSwitch);
  exec(`start "" "${config.BCC_EXE}"`);
  await esperar(config.DELAYS.capturaEnv);
}

/**
 * Configura o ambiente para o sistema SMART (CIN).
 * Para o serviço Valid, inicia o BCC da Griaule se não estiver rodando.
 */
async function configurarAmbienteSmart() {
  exec(`net stop "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);

  exec('tasklist /FI "IMAGENAME eq BCC.exe"', (err, stdout) => {
    if (!stdout?.includes("BCC.exe")) {
      exec(`start "" "${config.BCC_EXE}"`);
    }
  });
}

/**
 * Desliga e liga o leitor Suprema RealScan-D (necessário ao trocar SMART/CIN → CapturaWeb).
 * Executa Disable, aguarda, depois Enable para o dispositivo efetivamente reiniciar.
 */
async function ciclarSupremaRealScanD() {
  const disableCmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false"`;
  const enableCmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Enable-PnpDevice -Confirm:$false"`;
  exec(disableCmd);
  await esperar(config.DELAYS.supremaPowerCycle ?? 1200);
  exec(enableCmd);
  await esperar(config.DELAYS.capturaEnv);
}

/**
 * Configura o ambiente para o CapturaWeb.
 * Encerra BCC e Java, reinicia o leitor Suprema RealScan-D (desliga/liga) e inicia o serviço Valid.
 */
async function configurarAmbienteCaptura() {
  exec("taskkill /F /IM BCC.exe /T");
  exec("taskkill /F /IM javaw.exe /T");
  await esperar(config.DELAYS.capturaEnv);

  exec(`net stop "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);

  await ciclarSupremaRealScanD();

  exec(`net start "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
}

module.exports = {
  configurarAmbienteSmart,
  configurarAmbienteCaptura,
  reiniciarServicoHardware,
  reiniciarBCC,
};
