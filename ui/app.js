/**
 * @fileoverview Ponto de entrada da aplicação (Renderer Process)
 * @module app
 *
 * Responsabilidade: Inicializar o Controller quando o DOM estiver pronto.
 * Padrão MVC: Controller coordena Model e View.
 */
import Controller from "./js/core/controller.js";

document.addEventListener("DOMContentLoaded", () => {
  Controller.init();
});
