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
  extrairChaveServico,
  processoListado,
  pidsDaImagemTexto,
  pareceServicoGriaule,
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

  it("lê a lista em CP850, página do console em português", () => {
    const texto =
      "NOME_DO_SERVIÇO: ValidHardware\n" +
      "NOME_PARA_EXIBIÇÃO: Valid - Serviço de Hardware\n" +
      "        ESTADO             : 4  RUNNING\n";
    const cp850 = Buffer.alloc(texto.length);
    const acentos = {
      Ç: 0x80,
      ç: 0x87,
      Ã: 0xc7,
      ã: 0xc6,
    };
    for (let i = 0; i < texto.length; i++) {
      cp850[i] = acentos[texto[i]] ?? texto.charCodeAt(i);
    }
    const decodificado = decodificarSaidaWindows(cp850);
    assert.match(decodificado, /NOME_DO_SERVIÇO:\s*ValidHardware/);
    const escolhidos = selecionarServicosValid(listarServicosSc(decodificado), [
      "Valid-ServicoIntegracaoHardware",
      "Valid - Servico de Hardware",
    ]);
    assert.deepEqual(escolhidos.map((s) => s.nome), ["ValidHardware"]);
    assert.equal(escolhidos[0].rodando, true);
  });

  it("lê o nome do serviço mesmo com o Ç corrompido na decodificação", () => {
    const texto =
      "NOME_DO_SERVI\uFFFDO: Valid-ServicoIntegracaoHardware\n" +
      "NOME_PARA_EXIBI\uFFFD\uFFFDO: Valid - Servico de Hardware\n" +
      "        ESTADO             : 1  STOPPED\n";
    const escolhidos = selecionarServicosValid(listarServicosSc(texto), [
      "Valid-ServicoIntegracaoHardware",
      "Valid - Servico de Hardware",
    ]);
    assert.equal(escolhidos.length, 1);
    assert.equal(escolhidos[0].rodando, false);
    assert.equal(deveIniciarServico({ existe: true, rodando: false }), true);
    assert.equal(devePararServico({ existe: true, rodando: false }), false);
  });
});

describe("consulta individual e processo do BCC", () => {
  it("não trata estado desconhecido como serviço já em execução", () => {
    const info = { existe: true, rodando: false, estadoDesconhecido: true };
    assert.equal(deveIniciarServico(info), true);
    assert.equal(devePararServico(info), true);
    assert.equal(deveIniciarServico({ existe: false, rodando: false, confirmadoAusente: true }), false);
    assert.equal(devePararServico({ existe: false, rodando: false, confirmadoAusente: true }), false);
  });

  it("extrai o nome interno devolvido pelo sc GetKeyName em português", () => {
    const saida = "[SC] GetServiceKeyName êxito\r\nNome = Valid-ServicoIntegracaoHardware\r\n";
    assert.equal(extrairChaveServico(saida), "Valid-ServicoIntegracaoHardware");
    assert.equal(extrairChaveServico("[SC] GetServiceKeyName SUCCESS\nName = GBS BCC Service\n"), "GBS BCC Service");
  });

  it("não confunde a mensagem de tasklist vazio com o BCC em execução", () => {
    const vazio = "INFORMAÇÕES: nenhuma tarefa em execução correspondente aos critérios especificados.";
    assert.equal(processoListado(vazio, "BCC.exe"), false);
    const linha = "BCC.exe                     18184 Console                    1     12.340 K";
    assert.equal(processoListado(linha, "BCC.exe"), true);
    assert.deepEqual(pidsDaImagemTexto('"BCC.exe","18184","Console","1","12.340 K"', "BCC.exe"), [18184]);
  });

  it("reconhece serviço Griaule sem pegar o hardware da Valid", () => {
    assert.equal(pareceServicoGriaule({ nome: "GBS BCC Service", exibicao: "GBS BCC Service" }), true);
    assert.equal(
      pareceServicoGriaule({ nome: "ValidHardware", exibicao: "Valid - Serviço de Hardware" }),
      false
    );
  });
});
