"use strict";

/**
 * Serviço de hardware: CapturaWeb (Suprema), SMART (Griaule BCC), serviço Valid.
 * Nenhuma operação exige administrador: net start/stop e PnP são best-effort (tentativa, log em falha, continua).
 * @module services/hardware.service
 */

const { exec } = require("child_process");
const { promisify } = require("util");
const { esperar } = require("../utils/helpers");
const config = require("../config/app.config");
const logger = require("../utils/logger");

const execAsync = promisify(exec);

const SERVICO_HARDWARE = "Valid-ServicoIntegracaoHardware";

/**
 * Executa um comando e ignora erros (ex.: acesso negado sem admin). Apenas registra no log.
 * @param {string} cmd
 * @returns {Promise<void>}
 */
async function execBestEffort(cmd) {
  try {
    await execAsync(cmd);
  } catch (err) {
    logger.logError(err);
  }
}

/**
 * Reinicia o serviço de hardware Valid (net stop + net start).
 * Best-effort: não exige admin; se falhar, apenas registra e continua.
 */
async function reiniciarServicoHardware() {
  await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
  await execBestEffort(`net start "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
}

/**
 * Mata o processo BCC e inicia novamente (SMART CIN).
 * Best-effort: taskkill pode falhar sem admin em processos de outro usuário.
 */
async function reiniciarBCC() {
  await execBestEffort("taskkill /F /IM BCC.exe /T");
  await esperar(config.DELAYS.hardwareSwitch);
  try {
    exec(`start "" "${config.BCC_EXE}"`, (err) => { if (err) logger.logError(err); });
  } catch (err) {
    logger.logError(err);
  }
  await esperar(config.DELAYS.capturaEnv);
}

/**
 * Configura o ambiente para o sistema SMART (CIN).
 * Para o serviço Valid: net stop best-effort; inicia BCC se não estiver rodando.
 */
async function configurarAmbienteSmart() {
  await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  const checkBcc = execAsync('tasklist /FI "IMAGENAME eq BCC.exe"').catch(() => ({ stdout: "" }));
  await esperar(config.DELAYS.hardwareSwitch);
  const { stdout } = await checkBcc;
  if (!stdout?.includes("BCC.exe")) {
    try {
      exec(`start "" "${config.BCC_EXE}"`, (e) => { if (e) logger.logError(e); });
    } catch (e) {
      logger.logError(e);
    }
  }
}

/**
 * Desliga e liga o leitor Suprema RealScan-D (trocar SMART → CapturaWeb).
 * Best-effort: Disable/Enable-PnpDevice exigem admin; em falha apenas registra e continua.
 */
async function ciclarSupremaRealScanD() {
  const disableCmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false"`;
  const enableCmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Enable-PnpDevice -Confirm:$false"`;
  await execBestEffort(disableCmd);
  await esperar(config.DELAYS.supremaPowerCycle ?? 1200);
  await execBestEffort(enableCmd);
  await esperar(config.DELAYS.capturaEnv);
}

/**
 * Configura o ambiente para o CapturaWeb.
 * Encerra BCC e Java (best-effort), cicla Suprema (best-effort), inicia serviço Valid (best-effort).
 */
async function configurarAmbienteCaptura() {
  await execBestEffort("taskkill /F /IM BCC.exe /T");
  await execBestEffort("taskkill /F /IM javaw.exe /T");
  await esperar(config.DELAYS.capturaEnv);
  await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
  await ciclarSupremaRealScanD();
  await execBestEffort(`net start "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
}

module.exports = {
  configurarAmbienteSmart,
  configurarAmbienteCaptura,
  reiniciarServicoHardware,
  reiniciarBCC,
};
