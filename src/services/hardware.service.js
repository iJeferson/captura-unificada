"use strict";

/**
 * Serviço de hardware: CapturaWeb (Suprema), SMART (Griaule BCC), serviço Valid.
 * O computador tem permissão para parar/iniciar serviços.
 * @module services/hardware.service
 */

const { exec, spawn } = require("child_process");
const path = require("path");
const { promisify } = require("util");
const { esperar } = require("../utils/helpers");
const config = require("../config/app.config");
const logger = require("../utils/logger");

const execAsync = promisify(exec);

const SERVICOS_VALID = config.SERVICOS_VALID || ["Valid-ServicoIntegracaoHardware"];

/**
 * Verifica se um serviço Windows está rodando (STATE 4 = RUNNING).
 * @param {string} nome - Nome do serviço
 * @returns {Promise<boolean>}
 */
async function servicoEstaRodando(nome) {
  try {
    const { stdout } = await execAsync(`sc query "${nome}"`);
    return /STATE\s*:\s*4\s/.test(stdout);
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
 * Detecta se o erro de um comando é esperado e não deve ser logado.
 * Ex.: processo não encontrado ao matar, serviço já parado ao parar, serviço já iniciado ao iniciar.
 */
function isErroEsperado(cmd, err) {
  const msg = ((err.message || "") + " " + (err.stderr || "")).toLowerCase();
  const c = cmd.toLowerCase();
  if (msg.includes("1060") || msg.includes("does not exist") || msg.includes("não existe")) return true;
  if (c.includes("taskkill") && (msg.includes("foi encontrado") || msg.includes("not found") || err.code === 128)) return true;
  if (c.includes("net stop") && (msg.includes("3521") || msg.includes("não foi iniciado") || msg.includes("not started"))) return true;
  if (c.includes("net start") && (msg.includes("2182") || msg.includes("já foi iniciado") || msg.includes("already been started"))) return true;
  return false;
}

/**
 * Executa um comando e aguarda completar.
 * Só loga erros inesperados (ignora serviço já parado, processo não encontrado, etc.).
 * @param {string} cmd
 */
async function run(cmd) {
  try {
    await execAsync(cmd);
  } catch (err) {
    if (!isErroEsperado(cmd, err)) logger.logError(err);
  }
}

/**
 * Aguarda até o BCC.exe aparecer na lista de processos.
 * Verifica a cada 500ms, com timeout máximo de 10s.
 * @returns {Promise<boolean>} true se o BCC apareceu, false se timeout.
 */
async function aguardarBCCAbrir() {
  const maxMs = 10000;
  const intervalo = 200;
  let esperado = 0;
  while (esperado < maxMs) {
    if (await processoEstaRodando("BCC.exe")) return true;
    await esperar(intervalo);
    esperado += intervalo;
  }
  return false;
}

/**
 * Aguarda até o BCC.exe desaparecer da lista de processos.
 * Verifica a cada 200ms, com timeout máximo de 10s.
 * @returns {Promise<boolean>} true se o BCC fechou, false se timeout.
 */
async function aguardarBCCFechar() {
  const maxMs = 10000;
  const intervalo = 200;
  let esperado = 0;
  while (esperado < maxMs) {
    if (!(await processoEstaRodando("BCC.exe"))) return true;
    await esperar(intervalo);
    esperado += intervalo;
  }
  return false;
}

/**
 * Reinicia todos os serviços Valid de hardware (net stop + net start).
 * Executa em todos sem pré-verificação — erros esperados são filtrados silenciosamente.
 */
async function reiniciarServicoHardware() {
  for (const svc of SERVICOS_VALID) {
    await run(`net stop "${svc}"`);
  }
  for (const svc of SERVICOS_VALID) {
    await run(`net start "${svc}"`);
  }
}

/**
 * Mata o processo BCC e inicia novamente (SMART CIN).
 * Só executa taskkill se o BCC estiver rodando.
 */
async function reiniciarBCC() {
  if (await processoEstaRodando("BCC.exe")) {
    await run("taskkill /F /IM BCC.exe /T");
  }
  await esperar(config.DELAYS.hardwareSwitch);
  iniciarBCC();
  await esperar(config.DELAYS.capturaEnv);
}

/**
 * Configura o ambiente para o sistema SMART (CIN).
 * Para todos os serviços Valid; inicia BCC se não estiver rodando e aguarda estar pronto.
 */
async function configurarAmbienteSmart() {
  for (const svc of SERVICOS_VALID) {
    await run(`net stop "${svc}"`);
  }
  if (!(await processoEstaRodando("BCC.exe"))) {
    iniciarBCC();
  }
}

/**
 * Inicia o processo BCC.
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
 * Para todos os serviços Valid (libera hardware para o BCC iniciar).
 * Executa em todos sem pré-verificação.
 */
async function pararServicoValid() {
  for (const svc of SERVICOS_VALID) {
    await run(`net stop "${svc}"`);
  }
}

/**
 * Para os serviços Griaule e mata o processo BCC.
 * Evita conflito com Suprema ao abrir CapturaWeb.
 */
async function matarBCC() {
  const servicos = config.SERVICOS_GRIAULE_PARAR || [];
  for (const nome of servicos) {
    await run(`net stop "${nome}"`);
  }
  await run("taskkill /F /IM BCC.exe /T");
}

/**
 * Inicia todos os serviços Valid.
 * Executa em todos sem pré-verificação.
 */
async function iniciarServicoValid() {
  for (const svc of SERVICOS_VALID) {
    await run(`net start "${svc}"`);
  }
}

module.exports = {
  configurarAmbienteSmart,
  aguardarBCCAbrir,
  aguardarBCCFechar,
  matarBCC,
  pararServicoValid,
  iniciarBCC,
  iniciarServicoValid,
  reiniciarServicoHardware,
  reiniciarBCC,
};
