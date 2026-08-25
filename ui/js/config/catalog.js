"use strict";

/**
 * Catálogo dos sistemas do launcher (renderer).
 * Usado pela Home, Command Palette e overlay.
 */

export const CATALOG = Object.freeze([
  { id: "captura", nome: "CapturaWeb", grupo: "Sistemas integrados", descricao: "Captura de dados", icon: "fa-globe" },
  { id: "smart", nome: "SMART (CIN)", grupo: "Sistemas integrados", descricao: "CIN / Griaule", icon: "fa-file-invoice" },
  { id: "s4ipm", nome: "S4IPM", grupo: "Sistemas integrados", descricao: "Sistema interno", icon: "fa-server" },
  { id: "atende", nome: "Atende", grupo: "Outros sistemas", descricao: "Janela separada", icon: "fa-ticket", janelaExterna: true },
  { id: "validacao", nome: "Validação", grupo: "Outros sistemas", descricao: "Validação biométrica", icon: "fa-fingerprint" },
  { id: "doc-avulsos", nome: "Doc Avulso (Antigo)", grupo: "Outros sistemas", descricao: "CapturaWeb legado", icon: "fa-archive" },
  { id: "ponto-valid", nome: "Ponto Valid", grupo: "Outros sistemas", descricao: "Ponto eletrônico", icon: "fa-user-clock" },
  { id: "ponto-renova", nome: "Ponto Renova", grupo: "Outros sistemas", descricao: "Fortime", icon: "fa-clock-rotate-left" },
]);

export function getCatalogItem(id) {
  return CATALOG.find((s) => s.id === id) || null;
}
