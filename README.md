# Captura Unificada

**Launcher de sistemas integrados** — aplicação desktop (Electron) que centraliza o acesso a CapturaWeb, SMART (CIN), S4IPM, Doc Avulso (antigo), Validação, Ponto Valid, Ponto Renova e Atende.

Versão atual: veja `version` em `package.json` (ex.: **1.0.36**).

---

## Funcionalidades

- **Launcher unificado**: sidebar com todos os sistemas acima; conteúdo embutido na janela principal via `WebContentsView` (exceto Atende e Ponto Renova, em janelas próprias).
- **Integração com hardware (Windows)**:
  - **CapturaWeb**: se o BCC estiver instalado, dois ciclos de abrir/fechar liberam o leitor; se não estiver, a URL abre na hora. O reinício dos serviços Valid existentes segue em segundo plano.
  - **SMART (CIN)**: para o serviço Valid que está rodando e inicia o BCC se o executável estiver no disco, esperando o processo subir antes da URL.
  - **Doc Avulso (antigo)**: encerra o BCC se estiver aberto e inicia o serviço Valid parado. Se a lista de serviços não puder ser lida, tenta iniciar mesmo assim.
  - **Validação**: encerra BCC antes de carregar a URL; o app externo `CapturaWeb.exe` (Valid) pode ser reiniciado pela UI (`reiniciar-validacao`).
- **S4IPM** e **Ponto Valid**: carregamento direto da URL na view principal.
- **Ponto Renova**: janela separada com sessão isolada (`persist:ponto-renova`); opção de abrir no Google Chrome instalado; limpeza de cache só dessa sessão.
- **Atende**: janela separada; IP (ou URL) em `captura-unificada-atende.json` no diretório de dados do app; tema claro/escuro persistido no mesmo arquivo.
- **Conectividade**: a rede vale se algum sistema configurado responder. Um endereço bloqueado no posto não marca o aplicativo como sem internet. Banner offline só quando nenhum sistema responde; ao voltar, tenta restaurar o sistema ativo.
- **Cookies**: antes de carregar URLs sensíveis, o main process pode truncar cookies do domínio se o header ultrapassar limite (evita erro 400 por cookie grande).
- **Downloads**: downloads da sessão principal e do Atende vão para a pasta Downloads do usuário; painel na UI com progresso, abrir pasta, abrir PDF em janela filha.
- **Navegação**: possibilidade de navegar a view embutida por URL (barra/atalhos na UI, conforme implementado).
- **Logs de erro**: em `%AppData%\captura-unificada-data\Logs`, um arquivo por data.
- **Atualização automática**: `electron-updater` + releases no GitHub (`iJeferson/captura-unificada`); modal no renderer para instalar quando o pacote estiver baixado.
- **Informações do sistema**: hostname, IP, AnyDesk e versão do app na interface.
- **Instância única**: segunda execução foca a janela existente.
- **Tema claro/escuro**: persistido (inclui sincronização com config do Atende onde aplicável).
- **Sidebar colapsável**: recolhida, o conteúdo ocupa a largura toda e o botão de expandir flutua sobre a página (sem faixa lateral). Larguras em `app.config.js`.

---

## Requisitos

- **Node.js** `>= 24.11.0` e **Electron** `40.x` (ver `engines` e `devDependencies` em `package.json`).
- **Windows** x64 (build e uso previstos para `win x64`).

---

## Estrutura do repositório

```
captura-unificada/
├── main.js
├── preload.js
├── icon.png
├── package.json
├── build/
│   └── installer.nsh
├── src/
│   ├── config/app.config.js
│   ├── services/
│   │   ├── updater.service.js
│   │   ├── hardware.service.js
│   │   ├── system.service.js
│   │   ├── atende.service.js
│   │   ├── connectivity.service.js
│   │   └── session-downloads.js
│   ├── ipc/ipc.handlers.js
│   ├── window/window.manager.js
│   └── utils/
│       ├── helpers.js
│       └── logger.js
├── scripts/
│   └── copy-fontawesome.js
└── ui/
    ├── index.html
    ├── style.css
    ├── app.js
    └── js/
        ├── config/constants.js
        └── core/
            ├── model.js
            ├── view.js
            └── controller.js
```

---

## Instalação e execução

```bash
npm install
npm start
```

Desenvolvimento com logs do Chromium no terminal:

```bash
npm run dev
```

---

## Build

```bash
npm run build
```

Gera `dist/Captura-Unificada-Setup.exe` (NSIS). O executável e atalhos usam o nome **Captura Unificada**.

---

## Configuração

| O quê | Onde |
|--------|------|
| URLs dos sistemas, delays, serviços Valid, BCC, conectividade, partições de sessão, `ALLOW_INSECURE_CONNECTIONS` | `src/config/app.config.js` |
| IP/tema Atende | `%AppData%\captura-unificada-data\captura-unificada-atende.json` |
| Publicação de updates | `package.json` → `build.publish` (GitHub) |

O app redefine `userData` para `%AppData%\captura-unificada-data` (logs e configs do usuário, sem exigir administrador).

---

## Documentação técnica

Detalhes de fluxos, IPC, partições e processos: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## Autor

Jeferson Oliveira — © 2026
