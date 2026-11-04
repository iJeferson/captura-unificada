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
 * Tira acento, NUL de UTF-16 mal lido e caracteres que o code page troca.
 * Rótulos do `sc.exe` em português sobrevivem como NOME_DO_SERVI / ESTADO.
 * @param {string} valor
 * @returns {string}
 */
function foldRotulo(valor) {
  return String(valor || "")
    .replace(/\u0000/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .trim();
}

function pontuarTextoServico(texto) {
  const f = foldRotulo(texto);
  let nota = 0;
  if (f.includes("SERVICE_NAME") || f.includes("NOME_DO_SERVI")) nota += 5;
  if (f.includes("RUNNING") || f.includes("STOPPED")) nota += 3;
  if (f.includes("ESTADO") || f.includes("STATE") || f.includes("DISPLAY_NAME") || f.includes("EXIB")) nota += 1;
  return nota;
}

/**
 * `sc.exe` no Windows em português pode devolver UTF-16 ou o code page OEM.
 * Escolhe a leitura em que RUNNING/STOPPED e o nome do serviço continuam visíveis.
 * @param {Buffer|string|null|undefined} data
 * @returns {string}
 */
function decodificarSaidaWindows(data) {
  if (data == null) return "";
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "latin1");
  if (buf.length === 0) return "";
  const candidatos = [];
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    candidatos.push(buf.slice(2).toString("utf16le"));
  }
  if (buf.length >= 4 && buf[1] === 0 && buf[3] === 0) {
    candidatos.push(buf.toString("utf16le"));
  }
  const utf8 = buf.toString("utf8");
  candidatos.push(utf8);
  candidatos.push(buf.toString("latin1"));
  if (utf8.includes("\u0000")) {
    candidatos.push(Buffer.from(utf8, "latin1").toString("utf16le"));
  }
  let melhor = candidatos[0].replace(/^\uFEFF/, "");
  let melhorNota = -1;
  for (const candidato of candidatos) {
    const texto = candidato.replace(/^\uFEFF/, "");
    const nota = pontuarTextoServico(texto);
    if (nota > melhorNota) {
      melhor = texto;
      melhorNota = nota;
    }
  }
  return melhor;
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
/**
 * Acha RUNNING/STOPPED numa linha. Esses nomes ficam em inglês mesmo no Windows em português.
 * @param {string} stdout
 * @returns {{ codigo: string, nome: string } | null}
 */
function lerEstadoServico(stdout) {
  const linhas = String(stdout || "").replace(/\u0000/g, "").split(/\r?\n/);
  for (const linha of linhas) {
    const f = foldRotulo(linha);
    const m = f.match(/\b([0-9]+)\s+(RUNNING|STOPPED|START_PENDING|STOP_PENDING|CONTINUE_PENDING|PAUSE_PENDING|PAUSED)\b/);
    if (m) return { codigo: m[1], nome: m[2] };
  }
  return null;
}

function classificarConsultaServico(stdout, stderr, code) {
  const out = String(stdout || "").replace(/\u0000/g, "");
  const err = String(stderr || "").replace(/\u0000/g, "");
  const blob = foldRotulo(`${out}\n${err}`);
  const codeNum = typeof code === "number" ? code : null;
  const ausente = codeNum === 1060 || /1060|DOES NOT EXIST|NAO EXISTE/.test(blob);
  if (ausente) return { existe: false, rodando: false, confirmadoAusente: true, incerto: false };
  const estado = lerEstadoServico(out);
  const cabecalho = /SERVICE_NAME|NOME_DO_SERVI/.test(blob);
  if (estado || (codeNum === 0 && cabecalho)) {
    const rodando = Boolean(estado && (estado.codigo === "4" || estado.nome === "RUNNING"));
    return { existe: true, rodando, confirmadoAusente: false, incerto: !estado };
  }
  if (codeNum === 0 && blob.trim()) {
    return { existe: true, rodando: false, confirmadoAusente: false, incerto: true };
  }
  return { existe: false, rodando: false, confirmadoAusente: false, incerto: true };
}

/**
 * Quebra a lista de `sc query type= service state= all`.
 * @param {string} stdout
 * @returns {{ nome: string, exibicao: string, rodando: boolean }[]}
 */
/**
 * Quebra a lista de `sc query`. Não depende do acento de NOME_DO_SERVIÇO / NOME_PARA_EXIBIÇÃO:
 * no code page OEM esses rótulos chegam corrompidos e a lista parecia vazia.
 * @param {string} stdout
 * @returns {{ nome: string, exibicao: string, rodando: boolean }[]}
 */
function listarServicosSc(stdout) {
  const texto = String(stdout || "").replace(/\u0000/g, "").replace(/\r/g, "");
  const lista = [];
  let atual = null;
  const fechar = () => {
    if (atual?.nome) lista.push(atual);
    atual = null;
  };
  for (const linha of texto.split("\n")) {
    if (!linha.trim()) continue;
    const m = linha.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!m) continue;
    const indentado = m[1].length > 0;
    const rotulo = foldRotulo(m[2]);
    const valor = m[3].replace(/\u0000/g, "").trim();
    const ehNome =
      rotulo.includes("SERVICE_NAME") ||
      (rotulo.includes("NOME_DO_SERVI") && !rotulo.includes("EXIB"));
    const ehExibicao = rotulo.includes("DISPLAY_NAME") || rotulo.includes("EXIB");
    if (!indentado && ehNome) {
      fechar();
      atual = { nome: valor, exibicao: "", rodando: false };
      continue;
    }
    if (!atual) continue;
    if (ehExibicao && !atual.exibicao) {
      atual.exibicao = valor;
      continue;
    }
    const estado = foldRotulo(valor).match(/^([0-9]+)\s+(RUNNING|STOPPED|START_PENDING|STOP_PENDING|CONTINUE_PENDING|PAUSE_PENDING|PAUSED)\b/);
    if (estado) atual.rodando = estado[1] === "4" || estado[2] === "RUNNING";
  }
  fechar();
  return lista;
}

/**
 * `sc query` sem bufsize grande devolve erro de buffer e zero serviços.
 * @param {string} stdout
 * @param {string} stderr
 * @returns {boolean}
 */
function listaScTruncada(stdout, stderr) {
  const blob = foldRotulo(`${stdout || ""}\n${stderr || ""}`);
  return /MORE_DATA|MORE DATA|MAIS DADOS|ENUMQUERYSERVICESSTATUS|NEED [0-9]+ BYTES|PRECISA DE [0-9]+/.test(blob);
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
  if (!info?.existe) return false;
  if (info.incerto) return true;
  return Boolean(info.rodando);
}

function deveIniciarServico(info) {
  if (!info?.existe) return false;
  if (info.incerto) return true;
  return !info.rodando;
}

/**
 * Quando a lista não pôde ser lida, não dá para afirmar que o serviço está rodando.
 * Assumir `rodando: true` fazia o Doc Avulso pular o `net start` depois que o SMART tinha parado o hardware.
 * @param {string} nome
 * @returns {{ nome: string, existe: boolean, rodando: boolean, incerto: boolean }}
 */
function servicoEstadoIncerto(nome) {
  return { nome, existe: true, rodando: false, incerto: true };
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
  return r.stdout.replace(/\u0000/g, "").toLowerCase().includes(String(imagem).toLowerCase());
}

/**
 * @returns {Promise<string[]>}
 */
async function listarPidsBCC() {
  const r = await execFileBounded(
    "tasklist",
    ["/FI", `IMAGENAME eq ${BCC_IMAGEM}`, "/FO", "CSV", "/NH"],
    config.DELAYS.processQuery
  );
  if (r.timedOut) return [];
  const pids = [];
  for (const linha of r.stdout.replace(/\u0000/g, "").split(/\r?\n/)) {
    const m = linha.match(/"BCC\.exe"\s*[,;]\s*"(\d+)"/i);
    if (m) pids.push(m[1]);
  }
  return pids;
}

/**
 * @param {string} nome
 * @returns {Promise<{ existe: boolean, rodando: boolean }>}
 */
async function consultarServico(nome) {
  if (process.platform !== "win32") return { existe: false, rodando: false, confirmadoAusente: true, incerto: false };
  const r = await execFileBounded("sc.exe", ["query", nome], config.DELAYS.serviceQuery);
  if (r.timedOut) {
    logger.logWarn("SERVICE_QUERY_TIMEOUT", `Consulta do serviço excedeu o tempo: ${nome}`);
    return { existe: true, rodando: false, confirmadoAusente: false, incerto: true };
  }
  return classificarConsultaServico(r.stdout, r.stderr, r.code);
}

/**
 * `sc getkeyname` resolve o nome de exibição para o nome interno, que é o que `net start` precisa.
 * @param {string} exibicao
 * @returns {Promise<string>}
 */
async function chavePorNomeExibicao(exibicao) {
  const r = await execFileBounded("sc.exe", ["getkeyname", exibicao], config.DELAYS.serviceQuery);
  if (r.timedOut) return "";
  const texto = `${r.stdout || ""}\n${r.stderr || ""}`.replace(/\u0000/g, "");
  if (foldRotulo(texto).includes("1060")) return "";
  for (const linha of texto.split(/\r?\n/)) {
    const pedacos = linha.split(/[:=]/);
    if (pedacos.length < 2) continue;
    const rotulo = foldRotulo(pedacos[0]);
    const ehNome =
      rotulo === "NAME" ||
      rotulo === "NOME" ||
      (rotulo.includes("NOME_DO_SERVI") && !rotulo.includes("EXIB"));
    if (!ehNome) continue;
    const valor = pedacos.slice(1).join(":").trim();
    if (valor) return valor;
  }
  return "";
}

/**
 * O buffer padrão do `sc query` (1024 bytes) estoura em qualquer máquina com vários serviços
 * e a saída vem sem nenhum NOME_DO_SERVIÇO — era o SERVICE_QUERY_UNPARSED.
 * @returns {Promise<{ lista: { nome: string, exibicao: string, rodando: boolean }[], truncada: boolean, falha: boolean }>}
 */
async function enumerarServicosSc() {
  const r = await execFileBounded(
    "sc.exe",
    ["query", "type=", "service", "state=", "all", "bufsize=", "65536"],
    config.DELAYS.serviceCommand
  );
  const lista = listarServicosSc(r.stdout);
  const truncada = listaScTruncada(r.stdout, r.stderr);
  return {
    lista,
    truncada,
    falha: Boolean(r.timedOut) || (lista.length === 0 && !truncada),
  };
}

/**
 * @param {string} stdout
 * @returns {{ nome: string, exibicao: string, rodando: boolean }[]}
 */
function listarServicosPowerShell(stdout) {
  const lista = [];
  for (const linha of String(stdout || "").replace(/\u0000/g, "").split(/\r?\n/)) {
    const partes = linha.split("\t");
    if (partes.length < 3) continue;
    const nome = partes[0].trim();
    const status = foldRotulo(partes[partes.length - 1]);
    const exibicao = partes.slice(1, -1).join("\t").trim();
    if (!nome || (status !== "RUNNING" && status !== "STOPPED")) continue;
    lista.push({ nome, exibicao, rodando: status === "RUNNING" });
  }
  return lista;
}

async function enumerarViaPowerShell() {
  const script = 'Get-Service | ForEach-Object { $_.Name + "`t" + $_.DisplayName + "`t" + $_.Status }';
  const r = await execFileBounded(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    config.DELAYS.serviceCommand
  );
  if (r.timedOut) return null;
  const lista = listarServicosPowerShell(r.stdout);
  return lista.length > 0 ? lista : null;
}

/**
 * Consulta cada nome do config. Nome de exibição passa por `sc getkeyname`.
 * @returns {Promise<{ nome: string, exibicao: string, rodando: boolean, incerto?: boolean }[]>}
 */
async function consultarNomesConfigurados() {
  const achados = [];
  const vistos = new Set();
  for (const nome of SERVICOS_VALID) {
    let info = await consultarServico(nome);
    let nomeReal = nome;
    if (!info.existe) {
      const chave = await chavePorNomeExibicao(nome);
      if (chave) {
        info = await consultarServico(chave);
        nomeReal = chave;
      }
    }
    if (!info.existe) continue;
    const id = String(nomeReal).toLowerCase();
    if (vistos.has(id)) continue;
    vistos.add(id);
    achados.push({
      nome: nomeReal,
      exibicao: nome,
      rodando: Boolean(info.rodando) && !info.incerto,
      incerto: Boolean(info.incerto),
    });
  }
  return achados;
}

function publicarServicos(itens) {
  logSkipOnce(
    "HARDWARE_ENCONTRADO",
    `Serviço Valid encontrado: ${itens.map((s) => s.nome).join(", ")}`
  );
  return itens.map((s) => ({
    nome: s.nome,
    existe: true,
    rodando: Boolean(s.rodando) && !s.incerto,
    incerto: Boolean(s.incerto),
  }));
}

/**
 * Lê os serviços e fica com o da Valid pelo nome interno ou pelo nome de exibição.
 * Se a lista não vier, não assume que está rodando: o Doc Avulso precisa poder dar `net start`.
 * @returns {Promise<{ nome: string, existe: boolean, rodando: boolean, incerto?: boolean }[]>}
 */
async function servicosInstalados() {
  if (process.platform !== "win32") {
    logSkipOnce(
      "HARDWARE_AUSENTE",
      "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
    );
    return [];
  }

  const sc = await enumerarServicosSc();
  let escolhidos = selecionarServicosValid(sc.lista, SERVICOS_VALID);
  const listaConfiavel = sc.lista.length > 0 && !sc.truncada && !sc.falha;

  if (escolhidos.length === 0 && !listaConfiavel) {
    escolhidos = await consultarNomesConfigurados();
  }

  if (escolhidos.length === 0 && !listaConfiavel) {
    const viaPs = await enumerarViaPowerShell();
    if (viaPs) {
      const daLista = selecionarServicosValid(viaPs, SERVICOS_VALID);
      if (daLista.length > 0) {
        escolhidos = daLista;
      } else {
        logSkipOnce(
          "HARDWARE_AUSENTE",
          "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
        );
        return [];
      }
    }
  }

  if (escolhidos.length > 0) return publicarServicos(escolhidos);

  if (listaConfiavel) {
    logSkipOnce(
      "HARDWARE_AUSENTE",
      "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
    );
    return [];
  }

  if (!skipLog.has("SERVICE_QUERY_UNPARSED")) {
    skipLog.add("SERVICE_QUERY_UNPARSED");
    logger.logWarn(
      "SERVICE_QUERY_UNPARSED",
      "Não foi possível ler a lista de serviços. Os nomes configurados serão tentados mesmo assim."
    );
  }
  return SERVICOS_VALID.map(servicoEstadoIncerto);
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
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    if (await processoEstaRodando(BCC_IMAGEM)) return true;
    const restante = maxMs - (Date.now() - inicio);
    if (restante <= 0) break;
    await esperar(Math.min(200, restante));
  }
  return processoEstaRodando(BCC_IMAGEM);
}

/**
 * Aguarda o BCC.exe sair da lista de processos.
 * O tempo de parede inclui o tasklist, para o teto não estourar em silêncio.
 * @returns {Promise<boolean>}
 */
async function aguardarBCCFechar() {
  const maxMs = config.DELAYS.bccCloseTimeout;
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    if (!(await processoEstaRodando(BCC_IMAGEM))) return true;
    const restante = maxMs - (Date.now() - inicio);
    if (restante <= 0) break;
    await esperar(Math.min(200, restante));
  }
  return !(await processoEstaRodando(BCC_IMAGEM));
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
 * Espera o processo aparecer antes da URL. Sem o exe, não espera.
 */
async function configurarAmbienteSmart() {
  try {
    const lista = await servicosInstalados();
    for (const svc of lista) {
      if (devePararServico(svc)) await pararServicoConhecido(svc.nome);
    }
    const instalado = bccEstaInstalado();
    const rodando = await processoEstaRodando(BCC_IMAGEM);
    if (!instalado && !rodando) {
      logSkipOnce("BCC_IGNORADO", "BCC não instalado. SMART abre sem iniciar o BCC.");
      return;
    }
    if (rodando) return;
    if (!iniciarBCC()) return;
    const abriu = await aguardarBCCAbrir();
    if (!abriu) {
      logger.logWarn("BCC_OPEN_TIMEOUT", "BCC não apareceu a tempo. SMART abre mesmo assim.");
      return;
    }
    await esperar(config.DELAYS.bccStartup);
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
 * Encerra o BCC.exe. O `/T` sozinho falha com "Acesso negado" num filho e pode
 * deixar o processo pai vivo; por isso a imagem é encerrada antes da árvore.
 * @returns {Promise<boolean>} true se o BCC.exe não está mais na lista
 */
async function encerrarImagemBCC() {
  if (!(await processoEstaRodando(BCC_IMAGEM))) return true;

  const tentativas = [
    ["/F", "/IM", BCC_IMAGEM],
    ["/F", "/IM", BCC_IMAGEM, "/T"],
  ];
  let ultimo = null;
  for (const args of tentativas) {
    ultimo = await execFileBounded("taskkill", args, config.DELAYS.serviceCommand);
    if (ultimo.timedOut) logger.logWarn("BCC_KILL_TIMEOUT", "taskkill do BCC excedeu o tempo.");
    if (!(await processoEstaRodando(BCC_IMAGEM))) return true;
  }

  for (const pid of await listarPidsBCC()) {
    ultimo = await execFileBounded("taskkill", ["/F", "/PID", pid], config.DELAYS.serviceCommand);
    if (!(await processoEstaRodando(BCC_IMAGEM))) return true;
  }

  logger.logWarn(
    "BCC_KILL_FAILED",
    (ultimo?.stderr || ultimo?.stdout || "BCC.exe continua em execução.").trim()
  );
  return false;
}

/**
 * Encerra serviços Griaule configurados e o processo BCC, se estiver rodando.
 * @returns {Promise<boolean>}
 */
async function matarBCC() {
  const servicos = config.SERVICOS_GRIAULE_PARAR || [];
  for (const nome of servicos) {
    const info = await consultarServico(nome);
    if (devePararServico(info)) await pararServicoConhecido(nome);
  }
  return encerrarImagemBCC();
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
 * Doc Avulso: o SMART deixa o BCC com o leitor e o serviço Valid parado.
 * Solta o BCC e sobe o serviço antes da URL. Sem os dois, não espera.
 */
async function prepararAmbienteDocAvulso() {
  try {
    if (await processoEstaRodando(BCC_IMAGEM)) {
      const morreu = await matarBCC();
      if (!morreu) {
        const fechou = await aguardarBCCFechar();
        if (!fechou) {
          logger.logWarn(
            "BCC_CLOSE_TIMEOUT",
            "BCC não encerrou a tempo. Doc Avulso tenta o serviço mesmo assim."
          );
        }
      }
    }
    await iniciarServicoValid();
  } catch (err) {
    logger.logWarn(
      "DOC_AVULSO_ENV_FAILED",
      `Preparação do Doc Avulso seguiu mesmo com falha: ${err?.message || "erro desconhecido"}`
    );
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
        const morreu = await matarBCC();
        if (!morreu) {
          const fechou = await aguardarBCCFechar();
          if (!fechou) {
            logger.logWarn("BCC_CLOSE_TIMEOUT", "BCC não encerrou a tempo. CapturaWeb segue mesmo assim.");
          }
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
        const morreu = await matarBCC();
        if (morreu) continue;
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
  prepararAmbienteDocAvulso,
  planoLiberacaoBCC,
  classificarConsultaServico,
  decodificarSaidaWindows,
  listarServicosSc,
  listarServicosPowerShell,
  listaScTruncada,
  selecionarServicosValid,
  servicoEstadoIncerto,
  deveIniciarServico,
  devePararServico,
};
