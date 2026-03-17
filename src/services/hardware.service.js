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
 * Verifica se um serviço Windows está rodando (STATE 4 = RUNNING).
 * @param {string} nome - Nome do serviço
 * @returns {Promise<boolean>}
 */
async function servicoEstaRodando(nome) {
  try {
    const { stdout } = await execAsync(`sc query "${nome}"`);
    return /STATE\s*:\s*4\s/.test(stdout); // 4 = RUNNING
  } catch {
    return false;
  }
}

/**
 * Verifica se um processo está em execução.
 * @param {string} imagem - Nome do executável (ex: BCC.exe)
 * @returns {Promise<boolean>}
 */
async function processoEstaRodando(imagem) {
  try {
    const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${imagem}"`);
    return stdout.includes(imagem);
  } catch {
    return false;
  }
}

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
 * Só executa net stop se o serviço estiver rodando (evita log desnecessário).
 */
async function reiniciarServicoHardware() {
  if (await servicoEstaRodando(SERVICO_HARDWARE)) {
    await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  }
  await execBestEffort(`net start "${SERVICO_HARDWARE}"`);
}

/**
 * Mata o processo BCC e inicia novamente (SMART CIN).
 * Best-effort: taskkill pode falhar sem admin em processos de outro usuário.
 * Só executa taskkill se o BCC estiver rodando (evita log desnecessário).
 */
async function reiniciarBCC() {
  if (await processoEstaRodando("BCC.exe")) {
    await execBestEffort("taskkill /F /IM BCC.exe /T");
  }
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
 * Só executa net stop se o serviço estiver rodando (evita log desnecessário).
 */
async function configurarAmbienteSmart() {
  if (await servicoEstaRodando(SERVICO_HARDWARE)) {
    await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  }
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
 * Só executa net stop se o serviço estiver rodando (evita log desnecessário).
 */
async function pararServicoValid() {
  if (await servicoEstaRodando(SERVICO_HARDWARE)) {
    await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  }
  await esperar(config.DELAYS.hardwareSwitch);
}

/**
 * Para os serviços Griaule (GBS BCC Service, etc.) e mata o processo BCC.
 * Evita conflito com Suprema ao abrir CapturaWeb.
 * Só executa net stop/taskkill se o serviço/processo estiver rodando (evita log desnecessário).
 */
async function matarBCC() {
  const servicos = config.SERVICOS_GRIAULE_PARAR || [];
  for (const nome of servicos) {
    if (await servicoEstaRodando(nome)) {
      await execBestEffort(`net stop "${nome}"`);
    }
  }
  if (await processoEstaRodando("BCC.exe")) {
    await execBestEffort("taskkill /F /IM BCC.exe /T");
  }
}

/**
 * Reinicia o serviço Valid uma vez sem delay.
 * Só executa net stop se o serviço estiver rodando (evita log desnecessário).
 */
async function reiniciarServicoValidUmaVez() {
  if (await servicoEstaRodando(SERVICO_HARDWARE)) {
    await execBestEffort(`net stop "${SERVICO_HARDWARE}"`);
  }
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
