"use strict";

/**
 * @fileoverview Ponto de entrada do Renderer. Inicializa o Controller no DOMContentLoaded.
 * @module app
 */

import Controller from "./js/core/controller.js";

document.addEventListener("DOMContentLoaded", () => Controller.init());
