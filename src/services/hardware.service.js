"use strict";

/**
 * Serviço de hardware: CapturaWeb (Suprema), SMART (Griaule BCC), serviço Valid.
 * Nenhuma operação exige administrador: net start/stop e PnP são best-effort (tentativa, log em falha, continua).
 * @module services/hardware.service
 */

const { exec, spawn } = require("child_process");
const path = require("path");
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
  await execBestEffort(`net start "${SERVICO_HARDWARE}"`);
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
 * Inicia o processo BCC (best-effort).
 * Usa spawn com cwd no diretório do BCC para garantir inicialização correta.
 */
function iniciarBCC() {
  try {
    const bccDir = path.dirname(config.BCC_EXE);
    spawn(config.BCC_EXE, [], {
      cwd: bccDir,
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch (err) {
    logger.logError(err);
    try {
      exec(`start "" "${config.BCC_EXE}"`, (e) => { if (e) logger.logError(e); });
    } catch (e2) {
      logger.logError(e2);
    }
  }
}

/**
 * Para o serviço Valid (libera hardware para o BCC iniciar, igual ao fluxo SMART).
 */
async function pararServicoValid() {
  await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  await esperar(config.DELAYS.hardwareSwitch);
}

/**
 * Para os serviços Griaule (GBS BCC Service, etc.) e mata o processo BCC.
 * Evita conflito com Suprema ao abrir CapturaWeb.
 */
async function matarBCC() {
  const servicos = config.SERVICOS_GRIAULE_PARAR || [];
  for (const nome of servicos) {
    await execBestEffort(`net stop "${nome}"`);
  }
  await execBestEffort("taskkill /F /IM BCC.exe /T");
}

/**
 * Reinicia o serviço Valid uma vez sem delay.
 */
async function reiniciarServicoValidUmaVez() {
  await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  await execBestEffort(`net start "${SERVICO_HARDWARE}"`);
}

/**
 * Inicia o serviço Valid (apenas net start).
 */
async function iniciarServicoValid() {
  await execBestEffort(`net start "${SERVICO_HARDWARE}"`);
}

module.exports = {
  configurarAmbienteSmart,
  matarBCC,
  pararServicoValid,
  iniciarBCC,
  iniciarServicoValid,
  reiniciarServicoValidUmaVez,
  reiniciarServicoHardware,
  reiniciarBCC,
};
