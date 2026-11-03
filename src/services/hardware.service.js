"use strict";

/**
 * Serviço de hardware: CapturaWeb (Suprema), SMART (Griaule BCC), serviço Valid.
 * O computador tem permissão para parar/iniciar serviços.
 *
 * Estratégia: o que não está instalado é ignorado na hora (sem espera de timeout
 * do Windows). O que está instalado segue o mesmo efeito de antes — liberar o
 * leitor do BCC antes da CapturaWeb, parar o hardware Valid antes do SMART,
 * subir o serviço antes do Doc Avulso — com teto de tempo para não travar a URL.
 * @module services/hardware.service
 */

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { esperar } = require("../utils/helpers");
const config = require("../config/app.config");
const logger = require("../utils/logger");

const SERVICOS_VALID = config.SERVICOS_VALID || ["Valid-ServicoIntegracaoHardware"];
const BCC_IMAGEM = "BCC.exe";
const CICLOS_LIBERACAO_BCC = 2;

const skipLog = new Set();

function logSkipOnce(code, message) {
  if (skipLog.has(code)) return;
  skipLog.add(code);
  logger.logInfo(code, message);
}

/**
 * Plano da CapturaWeb: mesmo efeito de antes (soltar o leitor do BCC com dois
 * ciclos de abrir/fechar quando o BCC existe), sem esperar processo que não pode nascer.
 * @param {{ instalado: boolean, rodando: boolean }} estado
 * @returns {{ encerrar: boolean, ciclos: number }}
 */
function planoLiberacaoBCC({ instalado, rodando }) {
  if (!instalado && !rodando) return { encerrar: false, ciclos: 0 };
  return { encerrar: true, ciclos: instalado ? CICLOS_LIBERACAO_BCC : 0 };
}

/**
 * Interpreta a saída de `sc query`. Serviço inexistente não deve ir para net start/stop.
 * @param {string} stdout
 * @param {string} stderr
 * @param {number|null|undefined} code
 * @returns {{ existe: boolean, rodando: boolean }}
 */
function classificarConsultaServico(stdout, stderr, code) {
  const out = String(stdout || "");
  const blob = `${out}\n${stderr || ""}`;
  const codeNum = typeof code === "number" ? code : null;
  if (
    codeNum === 1060 ||
    /1060|does not exist|não existe|nao existe/i.test(blob)
  ) {
    return { existe: false, rodando: false };
  }
  const existe = codeNum === 0 && /STATE\s*:/i.test(out);
  if (!existe) return { existe: false, rodando: false };
  return { existe: true, rodando: /STATE\s*:\s*4\b/.test(out) };
}

function devePararServico(info) {
  return Boolean(info?.existe && info?.rodando);
}

function deveIniciarServico(info) {
  return Boolean(info?.existe && !info?.rodando);
}

function bccEstaInstalado() {
  if (process.platform !== "win32") return false;
  try {
    return fs.existsSync(config.BCC_EXE);
  } catch {
    return false;
  }
}

function execFileBounded(file, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 256 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          code: err ? (typeof err.code === "number" ? err.code : null) : 0,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          timedOut: Boolean(err && err.killed),
        });
      }
    );
  });
}

function saidaComando(r) {
  return `${r.stderr || ""}\n${r.stdout || ""}`.toLowerCase();
}

function paradaAceitavel(r) {
  if (!r.code) return true;
  const msg = saidaComando(r);
  return (
    msg.includes("3521") ||
    msg.includes("1060") ||
    msg.includes("1062") ||
    msg.includes("não foi iniciado") ||
    msg.includes("nao foi iniciado") ||
    msg.includes("not started") ||
    msg.includes("does not exist") ||
    msg.includes("não existe") ||
    msg.includes("nao existe")
  );
}

function inicioAceitavel(r) {
  if (!r.code) return true;
  const msg = saidaComando(r);
  return (
    msg.includes("2182") ||
    msg.includes("1060") ||
    msg.includes("já foi iniciado") ||
    msg.includes("ja foi iniciado") ||
    msg.includes("already been started") ||
    msg.includes("does not exist") ||
    msg.includes("não existe") ||
    msg.includes("nao existe")
  );
}

/**
 * @param {string} imagem
 * @returns {Promise<boolean>}
 */
async function processoEstaRodando(imagem) {
  if (process.platform !== "win32") return false;
  const r = await execFileBounded(
    "tasklist",
    ["/FI", `IMAGENAME eq ${imagem}`, "/NH"],
    config.DELAYS.processQuery
  );
  if (r.timedOut) return false;
  return r.stdout.toLowerCase().includes(String(imagem).toLowerCase());
}

/**
 * @param {string} nome
 * @returns {Promise<{ existe: boolean, rodando: boolean }>}
 */
async function consultarServico(nome) {
  if (process.platform !== "win32") return { existe: false, rodando: false };
  const r = await execFileBounded("sc", ["query", nome], config.DELAYS.serviceQuery);
  if (r.timedOut) {
    logger.logWarn("SERVICE_QUERY_TIMEOUT", `Consulta do serviço excedeu o tempo e foi ignorada: ${nome}`);
    return { existe: false, rodando: false };
  }
  return classificarConsultaServico(r.stdout, r.stderr, r.code);
}

async function servicosInstalados() {
  const consultas = await Promise.all(
    SERVICOS_VALID.map(async (nome) => ({ nome, ...(await consultarServico(nome)) }))
  );
  const presentes = consultas.filter((s) => s.existe);
  if (presentes.length === 0) {
    logSkipOnce(
      "HARDWARE_AUSENTE",
      "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
    );
  }
  return presentes;
}

async function pararServicoConhecido(nome) {
  const r = await execFileBounded("net", ["stop", nome], config.DELAYS.serviceCommand);
  if (r.timedOut) {
    logger.logWarn("SERVICE_STOP_TIMEOUT", `Parada do serviço excedeu o tempo e foi interrompida: ${nome}`);
    return;
  }
  if (!paradaAceitavel(r)) {
    logger.logWarn(
      "SERVICE_STOP_FAILED",
      `Não foi possível parar ${nome}. A abertura segue. ${(r.stderr || r.stdout).trim()}`.trim()
    );
  }
}

async function iniciarServicoConhecido(nome) {
  const r = await execFileBounded("net", ["start", nome], config.DELAYS.serviceCommand);
  if (r.timedOut) {
    logger.logWarn("SERVICE_START_TIMEOUT", `Início do serviço excedeu o tempo e foi interrompido: ${nome}`);
    return;
  }
  if (!inicioAceitavel(r)) {
    logger.logWarn(
      "SERVICE_START_FAILED",
      `Não foi possível iniciar ${nome}. A abertura segue. ${(r.stderr || r.stdout).trim()}`.trim()
    );
  }
}

/**
 * Aguarda o BCC.exe aparecer. Retorna na hora se o executável não existe.
 * @returns {Promise<boolean>}
 */
async function aguardarBCCAbrir() {
  if (!bccEstaInstalado()) return false;
  const maxMs = config.DELAYS.bccOpenTimeout;
  const intervalo = 200;
  let esperado = 0;
  while (esperado < maxMs) {
    if (await processoEstaRodando(BCC_IMAGEM)) return true;
    await esperar(intervalo);
    esperado += intervalo;
  }
  return false;
}

/**
 * Aguarda o BCC.exe sair da lista de processos.
 * @returns {Promise<boolean>}
 */
async function aguardarBCCFechar() {
  const maxMs = config.DELAYS.bccCloseTimeout;
  const intervalo = 200;
  let esperado = 0;
  while (esperado < maxMs) {
    if (!(await processoEstaRodando(BCC_IMAGEM))) return true;
    await esperar(intervalo);
    esperado += intervalo;
  }
  return false;
}

/**
 * Reinicia os serviços Valid que existem. Ausentes são ignorados sem `net start`.
 */
async function reiniciarServicoHardware() {
  const lista = await servicosInstalados();
  for (const svc of lista) {
    if (devePararServico(svc)) await pararServicoConhecido(svc.nome);
  }
  for (const svc of lista) {
    await iniciarServicoConhecido(svc.nome);
  }
}

/**
 * Mata o BCC se estiver em execução e inicia de novo, só quando o exe existe.
 */
async function reiniciarBCC() {
  const instalado = bccEstaInstalado();
  const rodando = await processoEstaRodando(BCC_IMAGEM);
  if (!instalado && !rodando) {
    logSkipOnce("BCC_IGNORADO", "BCC não instalado. Reinício ignorado.");
    return;
  }
  if (rodando) {
    await matarBCC();
    await aguardarBCCFechar();
  }
  if (!instalado) return;
  await esperar(config.DELAYS.hardwareSwitch);
  iniciarBCC();
  await esperar(config.DELAYS.capturaEnv);
}

/**
 * SMART: solta o hardware Valid (se existir) e sobe o BCC (se estiver instalado).
 * Não bloqueia a URL esperando serviço ou processo que não existe.
 */
async function configurarAmbienteSmart() {
  try {
    const lista = await servicosInstalados();
    for (const svc of lista) {
      if (devePararServico(svc)) await pararServicoConhecido(svc.nome);
    }
    if (!bccEstaInstalado()) {
      logSkipOnce("BCC_IGNORADO", "BCC não instalado. SMART abre sem iniciar o BCC.");
      return;
    }
    if (!(await processoEstaRodando(BCC_IMAGEM))) iniciarBCC();
  } catch (err) {
    logger.logWarn("SMART_ENV_FAILED", `Preparação do SMART seguiu mesmo com falha: ${err?.message || "erro desconhecido"}`);
  }
}

/**
 * Inicia o BCC. Não tenta spawn quando o exe não está no disco.
 * @returns {boolean}
 */
function iniciarBCC() {
  if (!bccEstaInstalado()) return false;
  try {
    const bccDir = path.dirname(config.BCC_EXE);
    const child = spawn(config.BCC_EXE, [], {
      cwd: bccDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", (err) => {
      logger.logWarn("BCC_START_FAILED", err?.message || "falha ao iniciar BCC");
    });
    child.unref();
    return true;
  } catch (err) {
    logger.logWarn("BCC_START_FAILED", err?.message || "falha ao iniciar BCC");
    return false;
  }
}

async function pararServicoValid() {
  try {
    const lista = await servicosInstalados();
    for (const svc of lista) {
      if (devePararServico(svc)) await pararServicoConhecido(svc.nome);
    }
  } catch (err) {
    logger.logWarn("HARDWARE_STOP_FAILED", err?.message || "falha ao parar serviço Valid");
  }
}

/**
 * Encerra serviços Griaule configurados e o processo BCC, se estiver rodando.
 */
async function matarBCC() {
  const servicos = config.SERVICOS_GRIAULE_PARAR || [];
  for (const nome of servicos) {
    const info = await consultarServico(nome);
    if (devePararServico(info)) await pararServicoConhecido(nome);
  }
  if (!(await processoEstaRodando(BCC_IMAGEM))) return;
  const r = await execFileBounded("taskkill", ["/F", "/IM", BCC_IMAGEM, "/T"], config.DELAYS.serviceCommand);
  if (r.timedOut) {
    logger.logWarn("BCC_KILL_TIMEOUT", "taskkill do BCC excedeu o tempo.");
    return;
  }
  if (r.code && r.code !== 128) {
    const msg = saidaComando(r);
    const ausente =
      msg.includes("não foi encontrado") ||
      msg.includes("nao foi encontrado") ||
      msg.includes("not found") ||
      msg.includes("não há ocorrência") ||
      msg.includes("nao ha ocorrencia");
    if (!ausente) {
      logger.logWarn("BCC_KILL_FAILED", (r.stderr || r.stdout || "falha ao encerrar BCC").trim());
    }
  }
}

/**
 * Sobe os serviços Valid que existem e não estão rodando.
 * Serviço ausente não chama `net start` (que seguraria a URL no timeout do Windows).
 */
async function iniciarServicoValid() {
  try {
    const lista = await servicosInstalados();
    for (const svc of lista) {
      if (deveIniciarServico(svc)) await iniciarServicoConhecido(svc.nome);
    }
  } catch (err) {
    logger.logWarn("HARDWARE_START_FAILED", err?.message || "falha ao iniciar serviço Valid");
  }
}

/**
 * CapturaWeb: libera o leitor do BCC somente se ele existe ou está em execução,
 * depois dispara o reinício do hardware em segundo plano e retorna para a URL abrir.
 */
async function prepararAmbienteCaptura() {
  try {
    const instalado = bccEstaInstalado();
    const rodando = await processoEstaRodando(BCC_IMAGEM);
    const plano = planoLiberacaoBCC({ instalado, rodando });

    if (!plano.encerrar && plano.ciclos === 0) {
      logSkipOnce(
        "BCC_IGNORADO",
        "BCC não instalado e não está em execução. CapturaWeb abre sem o ciclo de liberação."
      );
    } else {
      if (plano.encerrar && rodando) {
        await matarBCC();
        const fechou = await aguardarBCCFechar();
        if (!fechou) {
          logger.logWarn("BCC_CLOSE_TIMEOUT", "BCC não encerrou a tempo. CapturaWeb segue mesmo assim.");
        }
      }

      for (let i = 0; i < plano.ciclos; i++) {
        if (!iniciarBCC()) break;
        const abriu = await aguardarBCCAbrir();
        if (!abriu) {
          logger.logWarn("BCC_OPEN_TIMEOUT", "BCC não apareceu a tempo. Ciclos restantes foram ignorados.");
          break;
        }
        await esperar(config.DELAYS.bccStartup);
        await matarBCC();
        const fechou = await aguardarBCCFechar();
        if (!fechou) {
          logger.logWarn("BCC_CLOSE_TIMEOUT", "BCC não encerrou a tempo. Ciclos restantes foram ignorados.");
          break;
        }
      }
    }
  } catch (err) {
    logger.logWarn("CAPTURA_ENV_FAILED", `Preparação da CapturaWeb seguiu mesmo com falha: ${err?.message || "erro desconhecido"}`);
  }

  reiniciarServicoHardware().catch((err) =>
    logger.logWarn(
      "HARDWARE_SERVICE_RESTART_ASYNC_FAILED",
      `Falha no reinício assíncrono do serviço de hardware: ${err?.message || "erro desconhecido"}`
    )
  );
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
  prepararAmbienteCaptura,
  planoLiberacaoBCC,
  classificarConsultaServico,
  deveIniciarServico,
  devePararServico,
};
