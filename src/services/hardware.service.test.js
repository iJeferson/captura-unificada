"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  planoLiberacaoBCC,
  classificarConsultaServico,
  decodificarSaidaWindows,
  listarServicosSc,
  selecionarServicosValid,
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
      { existe: false, rodando: false, confirmadoAusente: true }
    );
    assert.deepEqual(
      classificarConsultaServico("", "O serviço especificado não existe.", 1060),
      { existe: false, rodando: false, confirmadoAusente: true }
    );
  });

  it("reconhece serviço parado e em execução, em inglês e em português", () => {
    const parado = "STATE              : 1  STOPPED";
    const rodando = "ESTADO             : 4  RUNNING";
    assert.deepEqual(classificarConsultaServico(parado, "", 0), {
      existe: true,
      rodando: false,
      confirmadoAusente: false,
    });
    assert.deepEqual(classificarConsultaServico(rodando, "", 0), {
      existe: true,
      rodando: true,
      confirmadoAusente: false,
    });
    assert.equal(deveIniciarServico(classificarConsultaServico(parado, "", 0)), true);
    assert.equal(devePararServico(classificarConsultaServico(parado, "", 0)), false);
    assert.equal(deveIniciarServico(classificarConsultaServico(rodando, "", 0)), false);
    assert.equal(devePararServico(classificarConsultaServico(rodando, "", 0)), true);
  });

  it("não chama net em saída irreconhecível", () => {
    const info = classificarConsultaServico("", "", null);
    assert.equal(info.confirmadoAusente, false);
    assert.equal(deveIniciarServico(info), false);
    assert.equal(devePararServico(info), false);
  });
});

describe("serviços Valid pelo nome de exibição", () => {
  const listaPt = `
NOME_DO_SERVIÇO: ValidHardware
NOME_PARA_EXIBIÇÃO: Valid - Serviço de Hardware
        TIPO               : 10  WIN32_OWN_PROCESS
        ESTADO             : 4  RUNNING

NOME_DO_SERVIÇO: Spooler
NOME_PARA_EXIBIÇÃO: Spooler de Impressão
        TIPO               : 10  WIN32_OWN_PROCESS
        ESTADO             : 4  RUNNING
`;

  it("decodifica a saída UTF-16 do sc.exe", () => {
    const bruto = Buffer.from("ESTADO             : 4  RUNNING", "utf16le");
    assert.match(decodificarSaidaWindows(bruto), /ESTADO\s*:\s*4/);
  });

  it("encontra o serviço pelo nome de exibição em português, sem pegar outro serviço", () => {
    const lista = listarServicosSc(listaPt);
    const escolhidos = selecionarServicosValid(lista, [
      "Valid-ServicoIntegracaoHardware",
      "Valid - Servico de Hardware",
    ]);
    assert.deepEqual(escolhidos.map((s) => s.nome), ["ValidHardware"]);
    assert.equal(escolhidos[0].rodando, true);
  });

  it("não duplica quando o nome interno e o de exibição apontam para o mesmo serviço", () => {
    const lista = listarServicosSc(`
SERVICE_NAME: Valid-ServicoIntegracaoHardware
DISPLAY_NAME: Valid - Servico de Hardware
        STATE              : 1  STOPPED
`);
    const escolhidos = selecionarServicosValid(lista, [
      "Valid-ServicoIntegracaoHardware",
      "Valid - Servico de Hardware",
    ]);
    assert.equal(escolhidos.length, 1);
    assert.equal(escolhidos[0].rodando, false);
  });
});
