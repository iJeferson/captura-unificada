"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  origensDeConectividade,
  resultadoIndicaAlcance,
  ehQuedaGeral,
  ehDestinoInalcancavel,
} = require("./connectivity.service");

describe("origensDeConectividade", () => {
  it("usa os sistemas configurados, sem repetir host e sem destino genérico", () => {
    const lista = origensDeConectividade({
      captura: "https://cnhba-prod.si.valid.com.br/CapturaWeb/Home",
      base: "https://cnhba-prod.si.valid.com.br",
      interno: "http://10.96.11.46/",
      invalida: "nota-url",
      vazia: "",
    });
    assert.deepEqual(lista, [
      "https://cnhba-prod.si.valid.com.br",
      "http://10.96.11.46",
    ]);
    assert.equal(lista.includes("https://8.8.8.8"), false);
  });
});

describe("resultadoIndicaAlcance", () => {
  it("trata recusa e certificado como rede presente", () => {
    assert.equal(resultadoIndicaAlcance({ code: "ECONNREFUSED" }), true);
    assert.equal(resultadoIndicaAlcance({ message: "ERR_CERT_AUTHORITY_INVALID" }), true);
    assert.equal(resultadoIndicaAlcance({ code: "ERR_CONNECTION_RESET" }), true);
  });

  it("não trata timeout, DNS ou bloqueio de ICMP como alcance", () => {
    assert.equal(resultadoIndicaAlcance({ code: "ENOTFOUND" }), false);
    assert.equal(resultadoIndicaAlcance({ message: "net::ERR_CONNECTION_TIMED_OUT" }), false);
    assert.equal(resultadoIndicaAlcance({ message: "net::ERR_INTERNET_DISCONNECTED" }), false);
    assert.equal(resultadoIndicaAlcance({ message: "net::ERR_NAME_NOT_RESOLVED" }), false);
  });
});

describe("falha de um sistema", () => {
  it("não classifica timeout de um endereço como queda geral", () => {
    assert.equal(ehQuedaGeral(-106), true);
    assert.equal(ehQuedaGeral(-130), true);
    assert.equal(ehQuedaGeral(-118), false);
    assert.equal(ehQuedaGeral(-105), false);
    assert.equal(ehDestinoInalcancavel(-118), true);
    assert.equal(ehDestinoInalcancavel(-105), true);
    assert.equal(ehDestinoInalcancavel(-22), true);
    assert.equal(ehDestinoInalcancavel(-3), false);
  });
});
