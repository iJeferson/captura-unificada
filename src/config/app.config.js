"use strict";

/**
 * @fileoverview Configurações centralizadas do Main Process.
 * Nenhuma operação do app exige elevação de administrador: logs e config usam AppData do usuário.
 * @module config/app.config
 */

const path = require("path");

/** Base dos dados do usuário (AppData ou equivalente) — sem necessidade de admin */
const USER_DATA_BASE = path.join(
  process.env.APPDATA || process.env.LOCALAPPDATA || process.env.USERPROFILE || ".",
  "captura-unificada-data"
);

/** @type {Record<string, unknown>} */
const appConfig = {
  /** Nome da aplicação (janelas, notificações, processos) */
  APP_NAME: "Captura Unificada",

  /** ID único do aplicativo para o Windows (AppUserModelId) */
  APP_ID: "com.consorcio.capturaunificada",

  /** Nome do diretório de dados do usuário (dentro de AppData) */
  USER_DATA_DIR: "captura-unificada-data",

  /** Diretório de logs (em AppData — não exige administrador) */
  LOG_DIR: path.join(USER_DATA_BASE, "Logs"),

  /**
   * SEGURANÇA – conexões e certificados
   * ignore-certificate-errors e disable-web-security REDUZEM a segurança (certificados SSL
   * e CORS são relaxados). Use true apenas quando necessário (ex.: redes internas com
   * certificados autoassinados). Em produção, em redes confiáveis, defina como false
   * para restaurar validação de certificados e políticas de origem.
   */
  ALLOW_INSECURE_CONNECTIONS: true,

  /** Largura da sidebar expandida (px) */
  SIDEBAR_WIDTH_EXPANDED: 240,

  /**
   * Largura reservada na view embutida com a sidebar recolhida.
   * 0: o conteúdo ocupa a janela inteira. O botão de expandir flutua
   * numa janela própria, por cima do WebContentsView, sem faixa lateral.
   */
  SIDEBAR_WIDTH_COLLAPSED: 0,

  /** Dimensões padrão da janela principal */
  WINDOW: {
    width: 1280,
    height: 800,
    /** Abaixo disso a sidebar não cabe sem rolagem; a janela não reduz mais. */
    minWidth: 1000,
    minHeight: 720,
    backgroundColor: "#0a0a0d",
  },

  /** URLs dos sistemas integrados */
  URLS: {
    capturaWeb: "https://cnhba-prod.si.valid.com.br/CapturaWeb/Home",
    capturaWebBase: "https://cnhba-prod.si.valid.com.br",
    smart: "https://nimba.dpt.ba.gov.br:8100",
    s4ipm: "http://10.96.11.46/",
    docAvulsos: "https://cnhba.si.valid.com.br/CapturaWeb32",
    validacao: "https://cnhba.si.valid.com.br/SiteCaptura/validacao",
    pontoValid: "http://www.adpexpert.com.br",
    pontoRenova: "https://app2.pontomais.com.br/login",
  },

  /**
   * Atende: config em AppData (não exige administrador).
   * Formato da URL: http://{IP}/guiche.asp?auto=1
   */
  ATENDE: {
    /** Diretório da config (AppData do usuário) */
    CONFIG_DIR: USER_DATA_BASE,
    /** Nome do arquivo de config */
    CONFIG_FILE: "captura-unificada-atende.json",
    /** Template da URL (substitui {IP}) */
    URL_TEMPLATE: "http://{IP}/guiche.asp?auto=1",
  },

  /** Configuração do auto-updater (GitHub) */
  UPDATER: {
    provider: "github",
    owner: "iJeferson",
    repo: "captura-unificada",
  },

  /** Partition do session para persistência de dados do WebView */
  SESSION_PARTITION: "persist:captura",

  /** Partition exclusiva do Atende - mantém cache e estado da página separados */
  SESSION_PARTITION_ATENDE: "persist:atende",

  /** Partition exclusiva do Ponto Renova - janela separada com sessão isolada */
  SESSION_PARTITION_PONTO_RENOVA: "persist:ponto-renova",

  /** Caminhos para leitura do ID do AnyDesk (APPDATA primeiro — não exige admin) */
  ANYDESK_PATHS: [
    path.join(process.env.APPDATA || "", "AnyDesk", "system.conf"),
    path.join(process.env.ProgramData || "C:\\ProgramData", "AnyDesk", "service.conf"),
    "C:\\ProgramData\\AnyDesk\\service.conf",
  ],

  /**
   * Serviços Valid de hardware a gerenciar (parar/iniciar/reiniciar).
   * Alguns desktops têm apenas um, outros têm ambos.
   * A ordem importa: o primeiro é parado primeiro e iniciado por último.
   */
  SERVICOS_VALID: [
    "Valid-ServicoIntegracaoHardware",
    "Valid - Servico de Hardware",
  ],

  /**
   * Tempos de preparação de hardware (ms).
   * Consulta de serviço ausente volta na hora; os tetos abaixo só valem
   * quando o executável ou o serviço realmente existe e não responde.
   */
  DELAYS: {
    hardwareSwitch: 500,
    capturaEnv: 400,
    /** Depois que o BCC.exe aparece: tempo para ele assumir e soltar o leitor. */
    bccStartup: 5000,
    /** Teto para o processo BCC nascer, só se o exe existe. */
    bccOpenTimeout: 10000,
    /**
     * Teto para o BCC.exe sair da lista depois do taskkill.
     * Conta o tempo de parede: a consulta do tasklist entra nesse teto.
     */
    bccCloseTimeout: 8000,
    /** sc query. Serviço inexistente responde bem antes disso. */
    serviceQuery: 2000,
    /**
     * Teto de net start / net stop / taskkill quando o alvo existe e não responde.
     * Serviço ausente nem chega aqui: `sc query` encerra a etapa na hora.
     */
    serviceCommand: 8000,
    /** tasklist. */
    processQuery: 3000,
  },

  /**
   * CapturaWeb externo (Validação) - outro app, não é este sistema.
   * Antes de abrir a URL de Validação, o processo CapturaWeb.exe deve estar rodando.
   * Se não estiver, este executável é aberto.
   */
  CAPTURAWEB_VALIDACAO_EXE: "C:\\Program Files\\Valid\\CapturaWeb\\Online\\CapturaWeb.exe",

  /** BCC (Griaule) - usado pelo SMART (CIN). */
  BCC_EXE: "C:\\Griaule\\BCC\\BCC.exe",

  /**
   * Serviços Griaule a parar ao abrir CapturaWeb (evita conflito com Suprema).
   * Vazio: usuários sem GBS BCC Service não geram logs de erro desnecessários.
   * Se tiver Griaule, adicione o nome exato (ex.: "GBS BCC Service") em services.msc.
   */
  SERVICOS_GRIAULE_PARAR: [],

  /**
   * Verificação de conectividade (aviso offline).
   * A rede vale se qualquer sistema em URLS responder. Não usa ping:
   * várias redes de governo bloqueiam ICMP para 8.8.8.8 e isso gerava alerta falso.
   * Um sistema sem liberação não derruba os outros.
   *
   * Rede estável (ex.: escritório): intervalMs 5000, timeoutMs 5000, consecutiveNeededForOnline 3.
   * Rede instável (ex.: Wi‑Fi fraco, 4G): valores abaixo — menos piscar e mais tolerância a falhas pontuais.
   */
  CONNECTIVITY: {
    /** Intervalo entre verificações (ms). */
    intervalMs: 5000,
    /** Timeout da verificação (ms). */
    timeoutMs: 4000,
    /** Quantas falhas consecutivas para declarar offline. */
    consecutiveNeeded: 4,
    /** Quantos sucessos consecutivos para declarar online de novo. */
    consecutiveNeededForOnline: 4,
    /** Tempo mínimo sem conexão (ms) antes de mostrar offline. */
    minOfflineDurationMs: 0,
  },
};

module.exports = Object.freeze(appConfig);
