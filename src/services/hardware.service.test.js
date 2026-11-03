"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  planoLiberacaoBCC,
  classificarConsultaServico,
  deveIniciarServico,
  devePararServico,
} = require("./hardware.service");

describe("planoLiberacaoBCC", () => {
  it("ignora o ciclo quando o BCC não está instalado nem em execução", () => {
    assert.deepEqual(planoLiberacaoBCC({ instalado: false, rodando: false }), {
      encerrar: false,
      ciclos: 0,
    });
  });

  it("só encerra um processo solto quando o exe não existe", () => {
    assert.deepEqual(planoLiberacaoBCC({ instalado: false, rodando: true }), {
      encerrar: true,
      ciclos: 0,
    });
  });

  it("mantém dois ciclos de liberação quando o BCC está instalado", () => {
    assert.deepEqual(planoLiberacaoBCC({ instalado: true, rodando: false }), {
      encerrar: true,
      ciclos: 2,
    });
    assert.deepEqual(planoLiberacaoBCC({ instalado: true, rodando: true }), {
      encerrar: true,
      ciclos: 2,
    });
  });
});

describe("classificarConsultaServico", () => {
  it("trata serviço inexistente como ausente", () => {
    assert.deepEqual(
      classificarConsultaServico("", "[SC] OpenService FAILED 1060:\r\nThe specified service does not exist.", 1060),
      { existe: false, rodando: false }
    );
    assert.deepEqual(
      classificarConsultaServico("", "O serviço especificado não existe.", 1060),
      { existe: false, rodando: false }
    );
  });

  it("reconhece serviço parado e em execução", () => {
    const parado = "STATE              : 1  STOPPED";
    const rodando = "STATE              : 4  RUNNING";
    assert.deepEqual(classificarConsultaServico(parado, "", 0), { existe: true, rodando: false });
    assert.deepEqual(classificarConsultaServico(rodando, "", 0), { existe: true, rodando: true });
    assert.equal(deveIniciarServico(classificarConsultaServico(parado, "", 0)), true);
    assert.equal(devePararServico(classificarConsultaServico(parado, "", 0)), false);
    assert.equal(deveIniciarServico(classificarConsultaServico(rodando, "", 0)), false);
    assert.equal(devePararServico(classificarConsultaServico(rodando, "", 0)), true);
  });

  it("não chama net em saída irreconhecível", () => {
    const info = classificarConsultaServico("", "", null);
    assert.equal(deveIniciarServico(info), false);
    assert.equal(devePararServico(info), false);
  });
});
