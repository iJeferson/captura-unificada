/**
 * @fileoverview Model - Camada de dados e estado da aplicação (MVC)
 * @module core/model
 *
 * Responsabilidade: Armazenar e gerenciar o estado central da UI.
 * O Model é a única fonte da verdade; View e Controller o consultam/atualizam.
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
  /** Informações do sistema obtidas via IPC */
  infoSistema: {
    version: "",
    hostname: "---",
    ip: "---",
    anydesk: "---",
  },
};

const Model = {
  estado,

  /**
   * Define o estado de carregamento.
   * @param {boolean} valor
   * @returns {boolean}
   */
  setCarregando(valor) {
    this.estado.carregando = valor;
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
