"use strict";

/**
 * @fileoverview Model - Estado central da UI (MVC). Única fonte da verdade.
 * @module core/model
 */

/**
 * Estado central da aplicação.
 * Todas as alterações passam pelos setters para manter consistência.
 */
const estado = {
  /** Indica se uma operação assíncrona está em andamento (bloqueia ações) */
  carregando: false,
  /** Sistema atualmente ativo: "captura" | "smart" | null */
  sistemaAtivo: null,
  /** Tema atual: true = escuro, false = claro */
  temaEscuro: true,
  /** Sidebar colapsada (true) ou expandida (false) */
  sidebarColapsada: false,
  /** Indica se atualização foi baixada e está pronta para aplicar */
  atualizacaoPronta: false,
  /** Conectividade (via Main Process): true = online, false = offline. Usado para banner e bloqueio de abertura de sistemas. */
  conectado: true,
  /** Informações do sistema obtidas via IPC */
  infoSistema: {
    version: "",
    hostname: "---",
    ip: "---",
    anydesk: "---",
  },
};

let carregandoTimer = null;
const CARREGANDO_TIMEOUT_MS = 60000;

const Model = {
  estado,

  /**
   * Define o estado de carregamento.
   * Reset automático por timeout de segurança para evitar travamento da UI.
   * @param {boolean} valor
   * @returns {boolean}
   */
  setCarregando(valor) {
    this.estado.carregando = valor;
    if (carregandoTimer) {
      clearTimeout(carregandoTimer);
      carregandoTimer = null;
    }
    if (valor) {
      carregandoTimer = setTimeout(() => {
        this.estado.carregando = false;
        carregandoTimer = null;
      }, CARREGANDO_TIMEOUT_MS);
    }
    return this.estado.carregando;
  },

  /** @returns {boolean} */
  getCarregando() {
    return this.estado.carregando;
  },

  /**
   * Define qual sistema está ativo.
   * @param {string|null} sistema - "captura" | "smart" | null
   * @returns {string|null}
   */
  setSistemaAtivo(sistema) {
    this.estado.sistemaAtivo = sistema;
    return this.estado.sistemaAtivo;
  },

  /** @returns {string|null} */
  getSistemaAtivo() {
    return this.estado.sistemaAtivo;
  },

  /**
   * Define se o tema escuro está ativo.
   * @param {boolean} valor
   * @returns {boolean}
   */
  setTemaEscuro(valor) {
    this.estado.temaEscuro = valor;
    return this.estado.temaEscuro;
  },

  /** @returns {boolean} */
  getTemaEscuro() {
    return this.estado.temaEscuro;
  },

  /**
   * Define se a sidebar está colapsada.
   * @param {boolean} valor
   * @returns {boolean}
   */
  setSidebarColapsada(valor) {
    this.estado.sidebarColapsada = valor;
    return this.estado.sidebarColapsada;
  },

  /** @returns {boolean} */
  getSidebarColapsada() {
    return this.estado.sidebarColapsada;
  },

  /**
   * Define se há atualização pronta para aplicar.
   * @param {boolean} valor
   * @returns {boolean}
   */
  setAtualizacaoPronta(valor) {
    this.estado.atualizacaoPronta = valor;
    return this.estado.atualizacaoPronta;
  },

  /** @returns {boolean} */
  getAtualizacaoPronta() {
    return this.estado.atualizacaoPronta;
  },

  /**
   * Define o estado de conectividade (atualizado pelo Main Process).
   * @param {boolean} valor - true = online, false = offline
   */
  setConectado(valor) {
    this.estado.conectado = valor;
    return this.estado.conectado;
  },

  /** @returns {boolean} */
  getConectado() {
    return this.estado.conectado;
  },

  /**
   * Atualiza parcialmente as informações do sistema.
   * @param {Object} info - { version?, hostname?, ip?, anydesk? }
   * @returns {Object}
   */
  setInfoSistema(info) {
    this.estado.infoSistema = { ...this.estado.infoSistema, ...info };
    return this.estado.infoSistema;
  },

  /**
   * Retorna cópia das informações do sistema.
   * @returns {Object}
   */
  getInfoSistema() {
    return { ...this.estado.infoSistema };
  },
};

export default Model;
