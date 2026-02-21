# Arquitetura - Captura Unificada

Documentação da estrutura do projeto e responsabilidades de cada módulo.

---

## Visão Geral

Aplicação **Electron** que funciona como launcher para sistemas integrados (CapturaWeb e SMART/CIN), com atualização automática via GitHub e integração com hardware de biometria.

---

## Estrutura de Diretórios

```
captura-unificada/
├── main.js                 # Ponto de entrada (bootstrap)
├── preload.js              # Context Bridge (Main ↔ Renderer)
├── icon.png                # Ícone do app
├── package.json
│
├── src/                    # Main Process (Node.js)
│   ├── config/
│   │   └── app.config.js   # Constantes, URLs, configurações
│   ├── services/
│   │   ├── updater.service.js    # Auto-update via GitHub
│   │   ├── hardware.service.js  # Suprema, Griaule BCC, Valid
│   │   └── system.service.js    # Hostname, IP, AnyDesk
│   ├── ipc/
│   │   └── ipc.handlers.js # Handlers IPC (captura, smart, etc.)
│   ├── window/
│   │   └── window.manager.js    # Janela principal e WebContentsView
│   └── utils/
│       └── helpers.js      # esperar(), obterAnydeskID()
│
└── ui/                     # Renderer Process (Browser)
    ├── index.html          # Template da interface
    ├── style.css           # Estilos
    ├── app.js              # Ponto de entrada (inicializa Controller)
    └── js/
        ├── config/
        │   └── constants.js      # IDs, classes, textos
        ├── core/                 # MVC
        │   ├── model.js          # Estado da aplicação
        │   ├── view.js           # Manipulação do DOM
        │   └── controller.js    # Eventos e coordenação
```

---

## Main Process (Electron)

| Módulo | Responsabilidade |
|--------|-------------------|
| **main.js** | Bootstrap: instância única, userData, flags Chrome, inicialização |
| **preload.js** | Expõe `window.api` ao Renderer via contextBridge |
| **config/app.config** | URLs, dimensões, partition, caminhos AnyDesk |
| **services/updater** | Verificar/baixar atualizações, notificação, quitAndInstall |
| **services/hardware** | Configurar ambiente Captura (Suprema) e SMART (BCC) |
| **services/system** | getSystemInfo: hostname, IP, AnyDesk, version |
| **ipc/handlers** | Registrar handlers: captura, smart, system-info, reload, cache, resize-sidebar |
| **window/manager** | Criar janela, contentView, ajustarView, preconnect |
| **utils/helpers** | esperar(ms), obterAnydeskID() |

---

## Renderer Process (UI)

| Módulo | Responsabilidade |
|--------|-------------------|
| **app.js** | DOMContentLoaded → Controller.init() |
| **config/constants** | ELEMENT_IDS, CSS_CLASSES, SISTEMAS, TEMA |
| **core/model** | Estado: carregando, sistemaAtivo, temaEscuro, infoSistema |
| **core/view** | mostrarLoading, setMenuAtivo, toggleSidebar, aplicarTema, etc. |
| **core/controller** | Handlers de clique, listeners IPC, coordenação Model ↔ View |

---

## Fluxo de Dados

```
[Usuário clica] → Controller (handler) → Model (setState) + View (atualiza DOM)
                                    → window.api (IPC) → Main Process
```

---

## Padrões Utilizados

- **MVC** na camada UI (Model-View-Controller)
- **Separação por responsabilidade** (config, services, ipc, window)
- **Context Bridge** para comunicação segura Main ↔ Renderer
- **Single Instance Lock** para evitar múltiplas janelas
