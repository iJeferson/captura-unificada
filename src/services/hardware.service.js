"use strict";

/**
 * Serviço de hardware: CapturaWeb (Suprema), SMART (Griaule BCC), serviço Valid.
 * O computador tem permissão para parar/iniciar serviços.
 *
 * Estratégia: o que não está instalado é ignorado na hora (sem espera de timeout
 * do Windows). O que está instalado segue o mesmo efeito de antes — liberar o
 * leitor do BCC antes da CapturaWeb e do Doc Avulso, parar o hardware Valid
 * antes do SMART, subir o BCC visível antes da URL do SMART e recolocar o
 * serviço Valid no ar antes do Doc Avulso — com teto de tempo para não travar a URL.
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
/** Nomes vistos em instalações Griaule. Só são parados se `sc query` confirmar que existem. */
const NOMES_GRIAULE_CONHECIDOS = ["GBS BCC Service", "BCCService", "Griaule BCC"];
/** Metade alta da página CP850 (console pt-BR). `sc.exe` redirecionado costuma usar essa página. */
const CP850_ACENTOS =
  "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0";

const skipLog = new Set();

function logSkipOnce(code, message) {
  if (skipLog.has(code)) return;
  skipLog.add(code);
  logger.logInfo(code, message);
}

function logWarnOnce(code, message) {
  if (skipLog.has(code)) return;
  skipLog.add(code);
  logger.logWarn(code, message);
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

function decodificarCp850(buf) {
  let out = "";
  for (const b of buf) {
    out += b < 0x80 ? String.fromCharCode(b) : CP850_ACENTOS[b - 0x80] || "";
  }
  return out;
}

function pontuarTextoServico(texto) {
  if (!texto) return 0;
  let pontos = 0;
  if (/SERVICE_NAME|DISPLAY_NAME/.test(texto)) pontos += 5;
  if (/NOME_DO_SERVI[CÇ]O/.test(texto)) pontos += 5;
  if (/NOME_PARA_EXIBI[CÇ][AÃ]O/.test(texto)) pontos += 4;
  if (/(?:STATE|ESTADO)\s*:\s*\d/.test(texto)) pontos += 3;
  if (texto.includes("\uFFFD")) pontos -= 4;
  return pontos;
}

function pareceUtf16Le(buf) {
  const amostra = buf.subarray(0, Math.min(buf.length, 80));
  let nulos = 0;
  let pares = 0;
  for (let i = 1; i < amostra.length; i += 2) {
    pares += 1;
    if (amostra[i] === 0) nulos += 1;
  }
  return pares >= 4 && nulos / pares >= 0.6;
}

/**
 * `sc.exe` e `tasklist` no Windows em português saem em UTF-16 ou na página
 * do console (CP850 / Windows-1252). Sem essa conversão, "ESTADO" e
 * "NOME_DO_SERVIÇO" não aparecem e um serviço instalado parece ausente.
 * @param {Buffer|string|null|undefined} data
 * @returns {string}
 */
function decodificarSaidaWindows(data) {
  if (data == null) return "";
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "latin1");
  if (buf.length === 0) return "";
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString("utf16le");
  }
  if (pareceUtf16Le(buf)) {
    return buf.toString("utf16le").replace(/^\uFEFF/, "");
  }

  const utf8 = buf.toString("utf8");
  const candidatos = [];
  if (!utf8.includes("\uFFFD")) candidatos.push(utf8);
  candidatos.push(decodificarCp850(buf));
  try {
    candidatos.push(new TextDecoder("windows-1252").decode(buf));
  } catch {
    /* runtime sem windows-1252 */
  }
  let semNulo = "";
  for (const b of buf) if (b !== 0) semNulo += String.fromCharCode(b);
  candidatos.push(semNulo);

  let melhor = utf8.replace(/\u0000/g, "");
  let melhorPontos = pontuarTextoServico(melhor);
  for (const texto of candidatos) {
    const pontos = pontuarTextoServico(texto);
    if (pontos > melhorPontos) {
      melhor = texto;
      melhorPontos = pontos;
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
    const nome = bloco.match(/(?:SERVICE_NAME|NOME_DO_SERVI.O)\s*:\s*(.+)/i);
    const exibicao = bloco.match(/(?:DISPLAY_NAME|NOME_PARA_EXIBI..O)\s*:\s*(.+)/i);
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
  if (!info?.existe || info.confirmadoAusente) return false;
  if (info.estadoDesconhecido) return true;
  return Boolean(info.rodando);
}

function deveIniciarServico(info) {
  if (!info?.existe || info.confirmadoAusente) return false;
  if (info.estadoDesconhecido) return true;
  return !info.rodando;
}

/**
 * Nome interno devolvido por `sc GetKeyName`.
 * @param {string} saida
 * @returns {string}
 */
function extrairChaveServico(saida) {
  for (const linha of String(saida || "").split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:Name|Nome)\s*=\s*(.+)\s*$/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

function pareceServicoGriaule(item) {
  const texto = normalizarNomeServico(`${item?.nome || ""} ${item?.exibicao || ""}`);
  if (!texto || texto.includes("valid")) return false;
  return texto.includes("bcc") || texto.includes("griaule");
}

function selecionarServicosGriaule(lista) {
  const vistos = new Set();
  const escolhidos = [];
  for (const item of lista || []) {
    if (!pareceServicoGriaule(item)) continue;
    const chave = String(item.nome || "").toLowerCase();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    escolhidos.push(item);
  }
  return escolhidos;
}

/**
 * A mensagem "nenhuma tarefa" não tem PID. Exige o número para não tratar
 * o nome do filtro como processo em execução.
 * @param {string} stdout
 * @param {string} imagem
 * @returns {boolean}
 */
function processoListado(stdout, imagem) {
  const alvo = String(imagem || "").toLowerCase();
  if (!alvo) return false;
  return String(stdout || "")
    .split(/\r?\n/)
    .some((linha) => {
      if (!linha.toLowerCase().includes(alvo)) return false;
      return /\s\d{2,}\s/.test(linha) || /,\s*"?\d{2,}"?/.test(linha);
    });
}

/**
 * @param {string} stdout
 * @param {string} imagem
 * @returns {number[]}
 */
function pidsDaImagemTexto(stdout, imagem) {
  const alvo = String(imagem || "").toLowerCase();
  const pids = [];
  for (const linha of String(stdout || "").split(/\r?\n/)) {
    const csv = linha.match(/"([^"]+)"\s*,\s*"(\d+)"/);
    if (csv && csv[1].toLowerCase() === alvo) {
      pids.push(Number(csv[2]));
      continue;
    }
    const tabela = linha.match(/^(\S+)\s+(\d+)\s+/);
    if (tabela && tabela[1].toLowerCase() === alvo) pids.push(Number(tabela[2]));
  }
  return pids;
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
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: "buffer" },
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
  return processoListado(r.stdout, imagem);
}

async function pidsDaImagem(imagem) {
  const r = await execFileBounded(
    "tasklist",
    ["/FI", `IMAGENAME eq ${imagem}`, "/FO", "CSV", "/NH"],
    config.DELAYS.processQuery
  );
  if (r.timedOut) return [];
  return pidsDaImagemTexto(r.stdout, imagem);
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

async function listarServicosWindows() {
  if (process.platform !== "win32") return null;
  const tentativas = [
    () =>
      execFileBounded(
        "cmd.exe",
        ["/d", "/s", "/c", "sc query type= service state= all"],
        config.DELAYS.serviceCommand
      ),
    () =>
      execFileBounded(
        "sc.exe",
        ["query", "type=", "service", "state=", "all"],
        config.DELAYS.serviceQuery
      ),
  ];
  for (const tentar of tentativas) {
    const r = await tentar();
    if (r.timedOut) continue;
    const lista = listarServicosSc(`${r.stdout || ""}\n${r.stderr || ""}`);
    if (lista.length > 0) return lista;
  }
  return null;
}

async function chavePorNomeDeExibicao(nomeExibicao) {
  const r = await execFileBounded("sc.exe", ["GetKeyName", nomeExibicao], config.DELAYS.serviceQuery);
  return extrairChaveServico(r.stdout) || extrairChaveServico(r.stderr);
}

/**
 * `sc query` só aceita o nome interno. O config também traz o nome de exibição.
 * @param {string} nomeConfigurado
 */
async function resolverServicoConfigurado(nomeConfigurado) {
  const direto = await consultarServico(nomeConfigurado);
  if (direto.existe) {
    return { nome: nomeConfigurado, existe: true, rodando: direto.rodando, estadoDesconhecido: false };
  }
  if (!direto.confirmadoAusente) {
    return { nome: nomeConfigurado, existe: true, rodando: false, estadoDesconhecido: true };
  }
  const chave = await chavePorNomeDeExibicao(nomeConfigurado);
  if (!chave || normalizarNomeServico(chave) === normalizarNomeServico(nomeConfigurado)) {
    return { nome: nomeConfigurado, existe: false, rodando: false, confirmadoAusente: true };
  }
  const info = await consultarServico(chave);
  if (info.existe) {
    return { nome: chave, existe: true, rodando: info.rodando, estadoDesconhecido: false };
  }
  if (!info.confirmadoAusente) {
    return { nome: chave, existe: true, rodando: false, estadoDesconhecido: true };
  }
  return { nome: nomeConfigurado, existe: false, rodando: false, confirmadoAusente: true };
}

async function resolverServicosConfigurados() {
  const vistos = new Set();
  const achados = [];
  for (const nome of SERVICOS_VALID) {
    const info = await resolverServicoConfigurado(nome);
    if (!info.existe) continue;
    const chave = info.nome.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    achados.push(info);
  }
  return achados;
}

/**
 * Lê os serviços Valid pelo nome interno ou pelo nome de exibição.
 * Lista ilegível não é tratada como "já está rodando": isso pulava o `net start`
 * do Doc Avulso depois que o SMART tinha parado o serviço.
 * @returns {Promise<{ nome: string, existe: boolean, rodando: boolean, estadoDesconhecido?: boolean }[]>}
 */
async function servicosInstalados() {
  if (process.platform !== "win32") {
    logSkipOnce(
      "HARDWARE_AUSENTE",
      "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
    );
    return [];
  }

  const lista = await listarServicosWindows();
  if (!lista) {
    logWarnOnce(
      "SERVICE_QUERY_UNPARSED",
      "Não foi possível ler a lista de serviços. Cada nome configurado será consultado."
    );
  } else {
    const encontrados = selecionarServicosValid(lista, SERVICOS_VALID).map((s) => ({
      nome: s.nome,
      existe: true,
      rodando: s.rodando,
      estadoDesconhecido: false,
    }));
    if (encontrados.length > 0) {
      logSkipOnce(
        "HARDWARE_ENCONTRADO",
        `Serviço Valid encontrado: ${encontrados.map((s) => s.nome).join(", ")}`
      );
      return encontrados;
    }
  }

  const resolvidos = await resolverServicosConfigurados();
  if (resolvidos.length > 0) {
    logSkipOnce(
      "HARDWARE_ENCONTRADO",
      `Serviço Valid encontrado: ${resolvidos.map((s) => s.nome).join(", ")}`
    );
    return resolvidos;
  }

  logSkipOnce(
    "HARDWARE_AUSENTE",
    "Nenhum serviço Valid de hardware instalado. A etapa foi ignorada e a página segue."
  );
  return [];
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
async function aguardarAte(maxMs, pronto) {
  const limite = Date.now() + maxMs;
  while (Date.now() < limite) {
    if (await pronto()) return true;
    const resta = limite - Date.now();
    if (resta <= 0) break;
    await esperar(Math.min(200, resta));
  }
  return pronto();
}

async function aguardarBCCAbrir() {
  if (!bccEstaInstalado()) return false;
  return aguardarAte(config.DELAYS.bccOpenTimeout, () => processoEstaRodando(BCC_IMAGEM));
}

/**
 * Aguarda o BCC.exe sair da lista de processos.
 * O tempo é de parede: a consulta do tasklist não estica o teto.
 * @returns {Promise<boolean>}
 */
async function aguardarBCCFechar() {
  return aguardarAte(
    config.DELAYS.bccCloseTimeout,
    async () => !(await processoEstaRodando(BCC_IMAGEM))
  );
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
  if (!(await processoEstaRodando(BCC_IMAGEM))) iniciarBCC({ mostrar: true });
  const abriu = await aguardarBCCAbrir();
  if (abriu) await esperar(config.DELAYS.bccStartup);
}

/**
 * SMART: solta o hardware Valid e sobe um BCC visível antes da URL.
 * Processo preso (taskkill anterior ou janela oculta) é encerrado e aberto de novo.
 * Não bloqueia a URL quando o exe não existe.
 */
async function configurarAmbienteSmart() {
  try {
    await pararServicoValid();
    await garantirBCCParaSmart();
  } catch (err) {
    logger.logWarn("SMART_ENV_FAILED", `Preparação do SMART seguiu mesmo com falha: ${err?.message || "erro desconhecido"}`);
  }
}

async function garantirBCCParaSmart() {
  if (!bccEstaInstalado()) {
    logSkipOnce("BCC_IGNORADO", "BCC não instalado. SMART abre sem iniciar o BCC.");
    return;
  }
  if (await processoEstaRodando(BCC_IMAGEM)) {
    await encerrarImagemBCC();
    await aguardarBCCFechar();
  }
  if (!(await processoEstaRodando(BCC_IMAGEM))) {
    if (!iniciarBCC({ mostrar: true })) return;
    const abriu = await aguardarBCCAbrir();
    if (!abriu) {
      logger.logWarn("BCC_OPEN_TIMEOUT", "BCC não apareceu a tempo. O SMART abre mesmo assim.");
      return;
    }
  } else {
    iniciarBCC({ mostrar: true });
  }
  await esperar(config.DELAYS.bccStartup);
}

/**
 * Inicia o BCC. O ciclo da CapturaWeb esconde a janela para não piscar na tela.
 * O SMART precisa da janela visível: `windowsHide` manda SW_HIDE e o BCC não sobe.
 * @param {{ mostrar?: boolean }} [opcoes]
 * @returns {boolean}
 */
function iniciarBCC(opcoes = {}) {
  if (!bccEstaInstalado()) return false;
  try {
    const bccDir = path.dirname(config.BCC_EXE);
    const child = spawn(config.BCC_EXE, [], {
      cwd: bccDir,
      detached: true,
      stdio: "ignore",
      windowsHide: opcoes.mostrar !== true,
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

async function pararServicosQueSeguramBCC() {
  const nomes = new Map();
  const lista = await listarServicosWindows();
  if (lista) {
    for (const item of selecionarServicosGriaule(lista)) nomes.set(item.nome.toLowerCase(), item.nome);
  } else {
    for (const nome of NOMES_GRIAULE_CONHECIDOS) nomes.set(nome.toLowerCase(), nome);
  }
  for (const nome of config.SERVICOS_GRIAULE_PARAR || []) {
    const chave = String(nome || "").toLowerCase();
    if (chave && !nomes.has(chave)) nomes.set(chave, nome);
  }
  for (const nome of nomes.values()) {
    const info = await consultarServico(nome);
    if (info.existe && info.rodando) await pararServicoConhecido(nome);
  }
}

/**
 * Encerra BCC.exe sem `/T`. A árvore falha com "Acesso negado" no processo
 * filho e devolve erro mesmo quando o BCC em si deveria cair — o processo
 * continua na lista e o SMART não abre outro.
 * @returns {Promise<boolean>} true se BCC.exe não está mais em execução
 */
async function encerrarImagemBCC() {
  if (!(await processoEstaRodando(BCC_IMAGEM))) return true;

  const r = await execFileBounded("taskkill", ["/F", "/IM", BCC_IMAGEM], config.DELAYS.serviceCommand);
  if (r.timedOut) logger.logWarn("BCC_KILL_TIMEOUT", "taskkill do BCC excedeu o tempo.");
  if (!(await processoEstaRodando(BCC_IMAGEM))) return true;

  const pids = await pidsDaImagem(BCC_IMAGEM);
  for (const pid of pids) {
    await execFileBounded("taskkill", ["/F", "/PID", String(pid)], config.DELAYS.serviceCommand);
  }
  if (!(await processoEstaRodando(BCC_IMAGEM))) return true;

  await execFileBounded(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "Stop-Process -Name BCC -Force -ErrorAction SilentlyContinue"],
    config.DELAYS.serviceCommand
  );
  if (!(await processoEstaRodando(BCC_IMAGEM))) return true;

  const detalhe = (r.stderr || r.stdout || "BCC.exe continua em execução.").trim();
  logger.logWarn("BCC_KILL_FAILED", detalhe);
  return false;
}

/**
 * Encerra serviços Griaule que seguram o leitor e o processo BCC.
 */
async function matarBCC() {
  await pararServicosQueSeguramBCC();
  await encerrarImagemBCC();
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
 * Solta o leitor do BCC. Se o processo não morrer, não abre outro ciclo em cima dele.
 * @param {string} rotulo
 */
async function liberarLeitorDoBCC(rotulo) {
  const instalado = bccEstaInstalado();
  const rodando = await processoEstaRodando(BCC_IMAGEM);
  const plano = planoLiberacaoBCC({ instalado, rodando });

  if (!plano.encerrar && plano.ciclos === 0) {
    logSkipOnce(
      "BCC_IGNORADO",
      "BCC não instalado e não está em execução. A página abre sem o ciclo de liberação."
    );
    return;
  }

  if (plano.encerrar && rodando) {
    await matarBCC();
    const fechou = await aguardarBCCFechar();
    if (!fechou) {
      logger.logWarn("BCC_CLOSE_TIMEOUT", `BCC não encerrou a tempo. ${rotulo} segue mesmo assim.`);
      logger.logWarn("BCC_CLOSE_TIMEOUT", "BCC não encerrou a tempo. Ciclos restantes foram ignorados.");
      return;
    }
  }

  for (let i = 0; i < plano.ciclos; i++) {
    if (await processoEstaRodando(BCC_IMAGEM)) {
      logger.logWarn("BCC_CLOSE_TIMEOUT", "BCC não encerrou a tempo. Ciclos restantes foram ignorados.");
      break;
    }
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

/**
 * CapturaWeb: libera o leitor do BCC somente se ele existe ou está em execução,
 * depois dispara o reinício do hardware em segundo plano e retorna para a URL abrir.
 */
async function prepararAmbienteCaptura() {
  try {
    await liberarLeitorDoBCC("CapturaWeb");
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

/**
 * Doc Avulso antigo usa o mesmo leitor do CapturaWeb. Depois do SMART o BCC
 * fica com o dispositivo e o serviço Valid está parado: solta o BCC e só então
 * reinicia o serviço, esperando ele ficar em execução antes da URL.
 */
async function prepararAmbienteDocAvulso() {
  try {
    await liberarLeitorDoBCC("Doc Avulso");
    await reiniciarServicoHardware();
    const lista = await servicosInstalados();
    if (lista.length === 0) return;
    const noAr = [];
    for (const svc of lista) {
      const info = await consultarServico(svc.nome);
      if (info.rodando) noAr.push(svc.nome);
    }
    if (noAr.length === 0) {
      logger.logWarn(
        "HARDWARE_START_FAILED",
        "O serviço Valid de hardware não está em execução. O Doc Avulso abre mesmo assim."
      );
    }
  } catch (err) {
    logger.logWarn(
      "DOC_AVULSO_ENV_FAILED",
      `Preparação do Doc Avulso seguiu mesmo com falha: ${err?.message || "erro desconhecido"}`
    );
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
  prepararAmbienteCaptura,
  prepararAmbienteDocAvulso,
  planoLiberacaoBCC,
  classificarConsultaServico,
  decodificarSaidaWindows,
  listarServicosSc,
  selecionarServicosValid,
  deveIniciarServico,
  devePararServico,
  extrairChaveServico,
  processoListado,
  pidsDaImagemTexto,
  pareceServicoGriaule,
};
