"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  planoLiberacaoBCC,
  classificarConsultaServico,
  decodificarSaidaWindows,
  listarServicosSc,
  listarServicosPowerShell,
  listaScTruncada,
  selecionarServicosValid,
  servicoEstadoIncerto,
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
      { existe: false, rodando: false, confirmadoAusente: true, incerto: false }
    );
    assert.deepEqual(
      classificarConsultaServico("", "O serviço especificado não existe.", 1060),
      { existe: false, rodando: false, confirmadoAusente: true, incerto: false }
    );
  });

  it("reconhece serviço parado e em execução, em inglês e em português", () => {
    const parado = "STATE              : 1  STOPPED";
    const rodando = "ESTADO             : 4  RUNNING";
    assert.deepEqual(classificarConsultaServico(parado, "", 0), {
      existe: true,
      rodando: false,
      confirmadoAusente: false,
      incerto: false,
    });
    assert.deepEqual(classificarConsultaServico(rodando, "", 0), {
      existe: true,
      rodando: true,
      confirmadoAusente: false,
      incerto: false,
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

  it("lê o serviço quando o acento do rótulo chega corrompido pelo code page", () => {
    const lista = listarServicosSc(`
NOME_DO_SERVI\uFFFDO: ValidHardware
NOME_PARA_EXIBI\uFFFD\uFFFDO: Valid - Servi\uFFFDo de Hardware
        TIPO               : 10  WIN32_OWN_PROCESS
        ESTADO             : 1  STOPPED
`);
    const escolhidos = selecionarServicosValid(lista, ["Valid - Servico de Hardware"]);
    assert.deepEqual(escolhidos.map((s) => s.nome), ["ValidHardware"]);
    assert.equal(escolhidos[0].rodando, false);
  });

  it("lê a lista UTF-16 mesmo se os NULs ainda estiverem no texto", () => {
    const original = [
      "NOME_DO_SERVIÇO: ValidHardware",
      "NOME_PARA_EXIBIÇÃO: Valid - Serviço de Hardware",
      "        ESTADO             : 4  RUNNING",
      "",
    ].join("\n");
    const comNulos = Buffer.from(original, "utf16le").toString("latin1");
    const escolhidos = selecionarServicosValid(listarServicosSc(comNulos), [
      "Valid - Servico de Hardware",
    ]);
    assert.deepEqual(escolhidos.map((s) => s.nome), ["ValidHardware"]);
    assert.equal(escolhidos[0].rodando, true);
  });

  it("reconhece o erro de buffer pequeno do sc query", () => {
    assert.equal(listaScTruncada("[SC] EnumQueryServicesStatus:MORE_DATA", ""), true);
    assert.equal(listaScTruncada("", "mais dados, tamanho do buffer=1024"), true);
    assert.equal(listaScTruncada(listaPt, ""), false);
  });
});

describe("consulta de serviço inconclusiva", () => {
  it("não trata o serviço como rodando quando a lista não pôde ser lida", () => {
    const info = servicoEstadoIncerto("Valid-ServicoIntegracaoHardware");
    assert.equal(info.rodando, false);
    assert.equal(info.incerto, true);
    assert.equal(deveIniciarServico(info), true);
    assert.equal(devePararServico(info), true);
  });
});

describe("listarServicosPowerShell", () => {
  it("separa nome, exibição e status", () => {
    const lista = listarServicosPowerShell(
      "ValidHardware\tValid - Serviço de Hardware\tRunning\nSpooler\tSpooler de Impressão\tStopped\n"
    );
    const escolhidos = selecionarServicosValid(lista, ["Valid - Servico de Hardware"]);
    assert.deepEqual(escolhidos.map((s) => s.nome), ["ValidHardware"]);
    assert.equal(escolhidos[0].rodando, true);
  });
});
