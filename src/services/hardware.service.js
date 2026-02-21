"use strict";

/**
 * @fileoverview Serviço de hardware: CapturaWeb (Suprema), SMART (Griaule BCC), serviço Valid.
 * @module services/hardware.service
 */

const { exec } = require("child_process");
const { esperar } = require("../utils/helpers");
const config = require("../config/app.config");
const logger = require("../utils/logger");

const SERVICO_HARDWARE = "Valid-ServicoIntegracaoHardware";

/**
 * Reinicia o serviço de hardware Valid (net stop + net start).
 * Usado antes de abrir a URL do CapturaWeb e no botão "Reiniciar Serviço de Hardware".
 */
async function reiniciarServicoHardware() {
  try {
    exec(`net stop "${SERVICO_HARDWARE}"`, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.hardwareSwitch);
    exec(`net start "${SERVICO_HARDWARE}"`, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.hardwareSwitch);
  } catch (err) {
    logger.logError(err);
  }
}

/**
 * Mata o processo BCC e inicia novamente.
 * Usado no botão "Reiniciar BCC" do SMART (CIN).
 */
async function reiniciarBCC() {
  try {
    exec("taskkill /F /IM BCC.exe /T", (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.hardwareSwitch);
    exec(`start "" "${config.BCC_EXE}"`, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.capturaEnv);
  } catch (err) {
    logger.logError(err);
  }
}

/**
 * Configura o ambiente para o sistema SMART (CIN).
 * Para o serviço Valid, inicia o BCC da Griaule se não estiver rodando.
 */
async function configurarAmbienteSmart() {
  try {
    exec(`net stop "${SERVICO_HARDWARE}"`, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.hardwareSwitch);
    exec('tasklist /FI "IMAGENAME eq BCC.exe"', (err, stdout) => {
      if (err) {
        logger.logError(err);
        return;
      }
      if (!stdout?.includes("BCC.exe")) {
        exec(`start "" "${config.BCC_EXE}"`, (e) => { if (e) logger.logError(e); });
      }
    });
  } catch (err) {
    logger.logError(err);
  }
}

/**
 * Desliga e liga o leitor Suprema RealScan-D (necessário ao trocar SMART/CIN → CapturaWeb).
 * Executa Disable, aguarda, depois Enable para o dispositivo efetivamente reiniciar.
 */
async function ciclarSupremaRealScanD() {
  try {
    const disableCmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false"`;
    const enableCmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Enable-PnpDevice -Confirm:$false"`;
    exec(disableCmd, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.supremaPowerCycle ?? 1200);
    exec(enableCmd, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.capturaEnv);
  } catch (err) {
    logger.logError(err);
  }
}

/**
 * Configura o ambiente para o CapturaWeb.
 * Encerra BCC e Java, reinicia o leitor Suprema RealScan-D (desliga/liga) e inicia o serviço Valid.
 */
async function configurarAmbienteCaptura() {
  try {
    exec("taskkill /F /IM BCC.exe /T", (err) => { if (err) logger.logError(err); });
    exec("taskkill /F /IM javaw.exe /T", (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.capturaEnv);
    exec(`net stop "${SERVICO_HARDWARE}"`, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.hardwareSwitch);
    await ciclarSupremaRealScanD();
    exec(`net start "${SERVICO_HARDWARE}"`, (err) => { if (err) logger.logError(err); });
    await esperar(config.DELAYS.hardwareSwitch);
  } catch (err) {
    logger.logError(err);
  }
}

module.exports = {
  configurarAmbienteSmart,
  configurarAmbienteCaptura,
  reiniciarServicoHardware,
  reiniciarBCC,
};
