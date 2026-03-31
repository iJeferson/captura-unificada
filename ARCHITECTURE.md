# Arquitetura — Captura Unificada

## Visão geral

Aplicação **Electron** (main + preload + renderer) que funciona como **launcher** de vários sistemas web e utilitários Windows (BCC Griaule, serviços Valid, `CapturaWeb.exe` para Validação). A UI do shell segue **MVC** no renderer; a comunicação com o main usa **Context Bridge** (`window.api`) e **IPC** (`invoke` / `on` / `send`).

- **Janela principal**: `BrowserWindow` carrega `ui/index.html`; o site ativo é exibido num **`WebContentsView`** filho (área à direita da sidebar).
- **Janelas auxiliares**: **Atende** e **Ponto Renova** — cada uma com `BrowserWindow` próprio e **partition** de sessão distinta.
- **Dados do usuário**: `app.setPath("userData", …/captura-unificada-data)` — logs, JSON do Atende, etc.

---

## Estrutura de pastas

```
captura-unificada/
├── main.js                 # Instância única, userData, flags Chromium, ready → janela + IPC
├── preload.js              # contextBridge → window.api
├── icon.png
├── build/installer.nsh
├── src/
│   ├── config/app.config.js    # URLs, janela, sidebar, delays, CONNECTIVITY, UPDATER, partições, exe paths
│   ├── services/
│   │   ├── updater.service.js       # electron-updater (GitHub), estado de update pendente
│   │   ├── hardware.service.js      # BCC, serviços Valid, reinício de hardware/BCC
│   │   ├── system.service.js        # Hostname, IP, AnyDesk, versão
│   │   ├── atende.service.js        # Ler/gravar IP e tema do JSON do Atende
│   │   ├── connectivity.service.js  # Online/offline, restauração após queda
│   │   └── session-downloads.js     # Downloads → pasta Downloads, eventos para o renderer
│   ├── ipc/ipc.handlers.js          # Todos os ipcMain handle/on
│   ├── window/window.manager.js     # Cria main + contentView + Atende + Ponto Renova; bounds; falhas de load
│   └── utils/
│       ├── helpers.js               # esperar(), etc.
│       └── logger.js                # Log em arquivo, handlers globais
└── ui/
    ├── index.html
    ├── style.css
    ├── app.js                       # Entrada do renderer → Controller
    └── js/
        ├── config/constants.js      # IDs DOM, SISTEMAS, classes CSS
        └── core/                    # MVC
            ├── model.js
            ├── view.js
            └── controller.js
```

---

## Partições de sessão (`session`)

| Partition | Uso |
|-----------|-----|
| `persist:captura` | `WebContentsView` principal, pop-ups filhos configurados com a mesma partition, PDF aberto a partir de download |
| `persist:atende` | Janela do Atende (+ handler de downloads registrado para essa sessão) |
| `persist:ponto-renova` | Janela do Ponto Renova (isolada da sessão principal) |

`clear-cache` (IPC) limpa **apenas** `persist:captura`. Existe handler separado para limpar **apenas** `persist:ponto-renova`.

---

## Fluxos ao abrir um sistema (resumo)

| Sistema | Preparação / observação |
|---------|-------------------------|
| **CapturaWeb** | Três ciclos: iniciar BCC → aguardar abertura → espera fixa → matar BCC → aguardar fechar; em seguida `reiniciarServicoHardware()` dispara em background; carrega URL. Antes disso, `trimCookiesIfNeeded` na URL. |
| **SMART (CIN)** | Para cada serviço Valid listado em config; se BCC não estiver rodando, inicia BCC; depois carrega URL (`configurarAmbienteSmart`). |
| **S4IPM** | Apenas carrega a URL (sem passo de hardware). |
| **Doc Avulso (antigo)** | `iniciarServicoValid()` em todos os serviços Valid configurados; carrega URL. |
| **Validação** | `matarBCC()`; carrega URL. O fluxo web pressupõe o cliente **CapturaWeb.exe** quando necessário; reinício explícito via IPC `reiniciar-validacao` (taskkill + spawn do exe em `CAPTURAWEB_VALIDACAO_EXE`). |
| **Ponto Valid** | Carrega URL direto. |
| **Ponto Renova** | `openOrFocusPontoRenovaWindow()` — não usa o `WebContentsView` principal. Opcional: abrir URL no Chrome (`ponto-renova-abrir-navegador`). |
| **Atende** | Se não houver IP válido na config, o renderer trata `needsConfig`; senão `openOrFocusAtendeWindow(url)` com template `http://{IP}/guiche.asp?auto=1`. |

Trocas concorrentes são serializadas com `processandoTroca` no `window.manager` + `openSystemContent` no IPC.

---

## Main process — responsabilidades

| Área | Detalhe |
|------|---------|
| **main.js** | `requestSingleInstanceLock`, `second-instance` → foco/restore; `userData`; switches (GPU, cache, desativação de parte de *Private Network Access*; opcional `ignore-certificate-errors` se `ALLOW_INSECURE_CONNECTIONS`); `preconnectUrls` após criar janela |
| **window.manager** | Bounds do embed (sidebar + `contentEmbedTopInset`); título `Captura Unificada v{versão} — {sistema}`; `did-fail-load` / rede → offline + placeholder; restauração quando conectividade volta; `session.preconnect` para bases usadas; **User-Agent** estilo Chrome e headers em domínios Ponto/Renova; **webRequest** para CORS em rede privada (RFC 1918) e `content-type` em CSS; permissões **geolocation** (pontomais) e **local-network**; menu mínimo (F5/F12 na view embutida); export de `onContentReachUrl` para hook opcional pós-navegação |
| **ipc.handlers** | Abertura por sistema; Atende/Ponto Renova; cookies; `clear-cache` / `clear-ponto-renova-cache`; downloads snapshot / abrir pasta / PDF; `content-view-navigate-url`; `apply-update-now`; reiniciar validação, serviço hardware, BCC |
| **session-downloads** | `will-download` → salvar em `app.getPath('downloads')`, eventos `download-*` para o launcher |
| **connectivity** | Intervalos e limiares em `app.config.js` → `connectivity-change` no renderer |

---

## Renderer (UI)

| Módulo | Responsabilidade |
|--------|------------------|
| **app.js** | Instancia o Controller |
| **constants** | `ELEMENT_IDS`, `SISTEMAS`, `CSS_CLASSES`, etc. |
| **model** | Estado (carregamento, sistema ativo, tema, offline, updates, downloads, …) |
| **view** | DOM, loading, menu ativo, sidebar, tema, banners, painel de downloads |
| **controller** | Cliques, chamadas `window.api.*`, listeners IPC |

---

## Preload → API exposta

O objeto `window.api` expõe apenas canais permitidos (abrir sistemas, sidebar, tema Atende, cache, reinícios, sistema, conectividade, update, navegação da view, downloads). Ver lista completa em `preload.js`.

---

## Padrões e decisões

- **Context isolation** + **sandbox** nas webPreferences das views web; **nodeIntegration: false**.
- **webSecurity: false** nas views que carregam sites legados / integrações internas (implicações de segurança conscientes).
- **Single instance lock** para um único processo de app.
- **MVC** no renderer; **serviços** no main por domínio (hardware, rede, arquivo, update).

---

## Dependências principais

- **electron** (dev/runtime alinhado à versão fixada no `package.json`)
- **electron-updater** — atualização com publish GitHub
- **@fortawesome/fontawesome-free** — cópia pós-install para `ui` via `scripts/copy-fontawesome.js`

---

## Build / distribuição

Configuração em `package.json` → `build`: **NSIS** x64, `appId` `com.consorcio.capturaunificada`, artefato `Captura-Unificada-Setup.exe`, publicação GitHub para o auto-updater.
