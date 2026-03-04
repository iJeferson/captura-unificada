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

  /** Largura da sidebar colapsada (px) */
  SIDEBAR_WIDTH_COLLAPSED: 32,

  /** Altura da barra superior (px) - reservada para futuras extensões */
  TOPBAR_HEIGHT: 0,

  /** Dimensões padrão da janela principal */
  WINDOW: {
    width: 1300,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0d",
  },

  /** URLs dos sistemas integrados */
  URLS: {
    capturaWeb: "https://cnhba-prod.si.valid.com.br/CapturaWebV2",
    capturaWebBase: "https://cnhba-prod.si.valid.com.br",
    smart: "https://nimba.dpt.ba.gov.br:8100",
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

  /** Caminhos para leitura do ID do AnyDesk (APPDATA primeiro — não exige admin) */
  ANYDESK_PATHS: [
    path.join(process.env.APPDATA || "", "AnyDesk", "system.conf"),
    path.join(process.env.ProgramData || "C:\\ProgramData", "AnyDesk", "service.conf"),
    "C:\\ProgramData\\AnyDesk\\service.conf",
  ],

  /** Delays para sincronização de processos (ms) - valores otimizados para resposta mais rápida */
  DELAYS: {
    hardwareSwitch: 500,
    capturaEnv: 400,
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
   * GBS BCC Service hospeda BCC e Capturar Digital. Tenta cada nome (net stop).
   * Se não funcionar, verifique o nome exato em services.msc e adicione aqui.
   */
  SERVICOS_GRIAULE_PARAR: ["GBS BCC Service"],

  /**
   * Verificação de conectividade (aviso offline).
   * Defina checkMode e a URL ou host que será validado.
   *
   * Rede estável (ex.: escritório): intervalMs 5000, timeoutMs 5000, consecutiveNeededForOnline 3.
   * Rede instável (ex.: Wi‑Fi fraco, 4G): valores abaixo — menos piscar e mais tolerância a falhas pontuais.
   */
  CONNECTIVITY: {
    /** "url" = requisição HTTP(S) ao checkUrl; "ping" = comando ping ao checkHost */
    checkMode: "url",
    /** URL usada quando checkMode === "url" */
    checkUrl: "https://www.google.com/generate_204",
    /** Host usado quando checkMode === "ping" (IP ou domínio) */
    checkHost: "8.8.8.8",
    /** Intervalo entre verificações (ms). Rede instável: 6000–8000 para não sobrecarregar. */
    intervalMs: 7000,
    /** Timeout da verificação (ms). Rede instável: 8000–10000 para dar tempo de responder. */
    timeoutMs: 8000,
    /** Quantas falhas consecutivas para declarar offline (2 = evita um único timeout virar offline). */
    consecutiveNeeded: 2,
    /** Quantos sucessos consecutivos para declarar online de novo (2 = reconhece volta da internet mais rápido). */
    consecutiveNeededForOnline: 2,
    /** Tempo mínimo sem conexão (ms) antes de mostrar offline — evita piscar por cache/navegador. */
    minOfflineDurationMs: 6000,
  },
};

module.exports = Object.freeze(appConfig);
