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
 * `sc.exe` no Windows em português devolve UTF-16. Sem essa conversão,
 * "ESTADO" não aparece e um serviço instalado parece ausente.
 * @param {Buffer|string|null|undefined} data
 * @returns {string}
 */
function decodificarSaidaWindows(data) {
  if (data == null) return "";
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "latin1");
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString("utf16le");
  }
  if (buf.length >= 4 && buf[1] === 0 && buf[3] === 0) {
    return buf.toString("utf16le").replace(/^\uFEFF/, "");
  }
  const texto = buf.toString("utf8");
  if (!texto.includes("\u0000")) return texto;
  return Buffer.from(texto, "latin1").toString("utf16le").replace(/^\uFEFF/, "");
}

function normalizarNomeServico(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Interpreta a saída de `sc query`. Aceita rótulos em inglês (STATE) e português (ESTADO).
 * @param {string} stdout
 * @param {string} stderr
 * @param {number|null|undefined} code
 * @returns {{ existe: boolean, rodando: boolean, confirmadoAusente: boolean }}
 */
function classificarConsultaServico(stdout, stderr, code) {
  const out = String(stdout || "");
  const blob = `${out}\n${stderr || ""}`;
  const codeNum = typeof code === "number" ? code : null;
  const ausente =
    codeNum === 1060 ||
    /1060|does not exist|não existe|nao existe/i.test(blob);
  if (ausente) return { existe: false, rodando: false, confirmadoAusente: true };
  const estado = out.match(/(?:STATE|ESTADO)\s*:\s*(\d+)/i);
  const cabecalho = /SERVICE_NAME|DISPLAY_NAME|NOME_DO_SERVI|NOME_PARA_EXIBI/i.test(out);
  if (codeNum === 0 && (estado || cabecalho)) {
    return { existe: true, rodando: Boolean(estado && estado[1] === "4"), confirmadoAusente: false };
  }
  return { existe: false, rodando: false, confirmadoAusente: false };
}

/**
 * Quebra a lista de `sc query type= service state= all`.
 * @param {string} stdout
 * @returns {{ nome: string, exibicao: string, rodando: boolean }[]}
 */
function listarServicosSc(stdout) {
  const texto = String(stdout || "").replace(/\r/g, "");
  const blocos = texto.split(/\n(?=(?:SERVICE_NAME|NOME_DO_SERVI))/i);
  const lista = [];
  for (const bloco of blocos) {
    const nome = bloco.match(/(?:SERVICE_NAME|NOME_DO_SERVI[CÇ]?O)\s*:\s*(.+)/i);
    const exibicao = bloco.match(/(?:DISPLAY_NAME|NOME_PARA_EXIBI[CÇ][AÃ]O)\s*:\s*(.+)/i);
    const estado = bloco.match(/(?:STATE|ESTADO)\s*:\s*(\d+)/i);
    if (!nome) continue;
    lista.push({
      nome: nome[1].trim(),
      exibicao: exibicao ? exibicao[1].trim() : "",
      rodando: Boolean(estado && estado[1] === "4"),
    });
  }
  return lista;
}

function pareceHardwareValid(item) {
  const texto = normalizarNomeServico(`${item?.nome || ""} ${item?.exibicao || ""}`);
  if (!texto.includes("valid")) return false;
  return texto.includes("hardware") || texto.includes("integracao");
}

/**
 * Casa o que está no config com o nome interno ou com o nome de exibição.
 * No Windows, `sc query` só acha o nome interno; `net start` aceita os dois.
 * @param {{ nome: string, exibicao: string, rodando: boolean }[]} lista
 * @param {string[]} configurados
 */
function selecionarServicosValid(lista, configurados) {
  const alvos = new Set((configurados || []).map(normalizarNomeServico));
  const vistos = new Set();
  const escolhidos = [];
  for (const item of lista || []) {
    const bateConfig =
      alvos.has(normalizarNomeServico(item.nome)) ||
      alvos.has(normalizarNomeServico(item.exibicao));
    if (!bateConfig && !pareceHardwareValid(item)) continue;
    const chave = String(item.nome || "").toLowerCase();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    escolhidos.push({ nome: item.nome, exibicao: item.exibicao, rodando: Boolean(item.rodando) });
  }
  return escolhidos;
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
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: "buffer" },
      (err, stdout, stderr) => {
        resolve({
          code: err ? (typeof err.code === "number" ? err.code : null) : 0,
          stdout: decodificarSaidaWindows(stdout),
          stderr: decodificarSaidaWindows(stderr),
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
  if (process.platform !== "win32") return { existe: false, rodando: false, confirmadoAusente: true };
  const r = await execFileBounded("sc.exe", ["query", nome], config.DELAYS.serviceQuery);
  if (r.timedOut) {
    logger.logWarn("SERVICE_QUERY_TIMEOUT", `Consulta do serviço excedeu o tempo: ${nome}`);
    return { existe: false, rodando: false, confirmadoAusente: false };
  }
  return classificarConsultaServico(r.stdout, r.stderr, r.code);
}

/**
 * Lê todos os serviços e fica com o da Valid pelo nome interno ou pelo nome de exibição.
 * Se a lista não vier, não marca como ausente: tenta os nomes do config.
 * @returns {Promise<{ nome: string, existe: boolean, rodando: boolean }[]>}
 */
async function servicosInstalados() {
  if (process.platform !== "win32") {
    logSkipOnce(
      "HARDWARE_AUSENTE",
      "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
    );
    return [];
  }

  const r = await execFileBounded(
    "sc.exe",
    ["query", "type=", "service", "state=", "all"],
    config.DELAYS.serviceCommand
  );
  if (!r.timedOut) {
    const encontrados = selecionarServicosValid(listarServicosSc(r.stdout), SERVICOS_VALID);
    if (encontrados.length > 0) {
      logSkipOnce(
        "HARDWARE_ENCONTRADO",
        `Serviço Valid encontrado: ${encontrados.map((s) => s.nome).join(", ")}`
      );
      return encontrados.map((s) => ({ nome: s.nome, existe: true, rodando: s.rodando }));
    }
    if (listarServicosSc(r.stdout).length > 0) {
      logSkipOnce(
        "HARDWARE_AUSENTE",
        "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
      );
      return [];
    }
  }

  logger.logWarn(
    "SERVICE_QUERY_UNPARSED",
    "Não foi possível ler a lista de serviços. Os nomes configurados serão tentados mesmo assim."
  );
  return SERVICOS_VALID.map((nome) => ({ nome, existe: true, rodando: true }));
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
  decodificarSaidaWindows,
  listarServicosSc,
  selecionarServicosValid,
  deveIniciarServico,
  devePararServico,
};
