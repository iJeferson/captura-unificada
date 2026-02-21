/**
 * @fileoverview Configurações centralizadas da aplicação
 * @module config/app.config
 *
 * Responsabilidade: Armazenar constantes, URLs e parâmetros
 * utilizados em todo o Main Process da aplicação.
 */

const path = require("path");

module.exports = {
  /** Nome da aplicação (janelas, notificações, processos) */
  APP_NAME: "Captura Unificada",

  /** ID único do aplicativo para o Windows (AppUserModelId) */
  APP_ID: "com.consorcio.capturaunificada",

  /** Nome do diretório de dados do usuário (dentro de AppData) */
  USER_DATA_DIR: "captura-unificada-data",

  /**
   * SEGURANÇA – conexões e certificados
   * ignore-certificate-errors e disable-web-security REDUZEM a segurança (certificados SSL
   * e CORS são relaxados). Use true apenas quando necessário (ex.: redes internas com
   * certificados autoassinados). Em produção, em redes confiáveis, defina como false
   * para restaurar validação de certificados e políticas de origem.
   */
  ALLOW_INSECURE_CONNECTIONS: true,

  /** Largura da sidebar expandida (px) */
  SIDEBAR_WIDTH_EXPANDED: 220,

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
    backgroundColor: "#0b1220",
  },

  /** URLs dos sistemas integrados */
  URLS: {
    capturaWeb: "https://cnhba-prod.si.valid.com.br/CapturaWebV2",
    capturaWebBase: "https://cnhba-prod.si.valid.com.br",
    smart: "https://nimba.dpt.ba.gov.br:8100",
    docAvulsos: "https://cnhba.si.valid.com.br/CapturaWeb32",
    validacao: "https://cnhba.si.valid.com.br/SiteCaptura/conta/login",
    pontoValid: "http://www.adpexpert.com.br",
    pontoRenova: "https://app2.pontomais.com.br/login",
  },

  /**
   * Atende: arquivo no Desktop para armazenar IP (cada desktop pode ter URL diferente).
   * Formato da URL: http://{IP}/guiche.asp?auto=1
   * O arquivo persiste após atualizações do app.
   */
  ATENDE: {
    /** Diretório onde o arquivo de config é salvo (ex.: C:/TOOLS) */
    CONFIG_DIR: "C:/TOOLS",
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

  /** Caminhos para leitura do ID do AnyDesk */
  ANYDESK_PATHS: [
    path.join(process.env.ProgramData || "C:\\ProgramData", "AnyDesk", "service.conf"),
    path.join(process.env.APPDATA || "", "AnyDesk", "system.conf"),
    "C:\\ProgramData\\AnyDesk\\service.conf",
  ],

  /** Delays para sincronização de processos (ms) */
  DELAYS: {
    hardwareSwitch: 800,
    capturaEnv: 600,
    /** Pausa entre desligar e ligar o Suprema RealScan-D (para o dispositivo efetivamente reiniciar) */
    supremaPowerCycle: 1200,
  },

  /**
   * CapturaWeb externo (Validação) - outro app, não é este sistema.
   * Antes de abrir a URL de Validação, o processo CapturaWeb.exe deve estar rodando.
   * Se não estiver, este executável é aberto.
   */
  CAPTURAWEB_VALIDACAO_EXE: "C:\\Program Files\\Valid\\CapturaWeb\\Online\\CapturaWeb.exe",

  /** BCC (Griaule) - usado pelo SMART (CIN). */
  BCC_EXE: "C:\\Griaule\\BCC\\BCC.exe",
};
