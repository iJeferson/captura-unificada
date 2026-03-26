# Arquitetura — Captura Unificada

## Visão geral

Launcher de sistemas integrados com preparação de hardware (CapturaWeb, SMART), atualização automática e interface MVC.

---

## Estrutura

```
captura-unificada/
├── main.js                 # Bootstrap, instância única, userData
├── preload.js              # Context Bridge (window.api)
├── icon.png
├── build/installer.nsh
├── src/
│   ├── config/app.config.js    # URLs, delays, caminhos
│   ├── services/
│   │   ├── updater.service.js      # Auto-update GitHub
│   │   ├── hardware.service.js     # BCC, Valid, Griaule
│   │   ├── system.service.js       # Hostname, IP, AnyDesk
│   │   ├── atende.service.js       # Atende (IP, URL)
│   │   └── connectivity.service.js # Online/offline
│   ├── ipc/ipc.handlers.js    # Handlers IPC
│   ├── window/window.manager.js    # Janela, contentView, Atende
│   └── utils/
│       ├── helpers.js       # esperar(), obterAnydeskID()
│       └── logger.js        # Logs em arquivo
└── ui/
    ├── index.html
    ├── style.css
    ├── app.js
    └── js/
        ├── config/constants.js
        └── core/            # MVC
            ├── model.js
            ├── view.js
            └── controller.js
```

---

## Fluxos de abertura

| Sistema | Preparação |
|---------|------------|
| **CapturaWeb** | matarBCC (se rodando) → (iniciar BCC → esperar 3s → matar BCC) ×2 → carregar URL → reiniciar Valid 2x |
| **SMART (CIN)** | parar Valid → iniciar BCC se não rodando → aguardar BCC em execução → carregar URL |
| **Doc Avulsos** | iniciar Valid (se parado) → carregar URL |
| **Validação** | matar BCC → carregar URL |
| **Ponto Valid, Ponto Renova** | carregar URL |
| **Atende** | janela separada (URL configurável) |

---

## Main Process

| Módulo | Responsabilidade |
|--------|------------------|
| main.js | Instância única, userData, flags, inicialização |
| preload.js | window.api via contextBridge |
| config | URLs, dimensões, partition, caminhos |
| updater | Verificar/baixar atualizações |
| hardware | matarBCC, iniciarBCC, parar/iniciar/reiniciar Valid |
| system | getSystemInfo |
| atende | Config IP, buildAtendeUrl |
| connectivity | Verificação de rede |
| ipc/handlers | captura, smart, doc-avulsos, validacao, etc. |
| window/manager | Janela, contentView, Atende |
| helpers | esperar, obterAnydeskID |
| logger | logError, initGlobalHandlers |

---

## Renderer (UI)

| Módulo | Responsabilidade |
|--------|------------------|
| app.js | Inicializa Controller |
| constants | ELEMENT_IDS, CSS_CLASSES, SISTEMAS |
| model | Estado (carregando, sistemaAtivo, tema, etc.) |
| view | DOM, loading, menu ativo, sidebar, tema |
| controller | Cliques, IPC, coordenação |

---

## Padrões

- **MVC** na UI
- **Context Bridge** para Main ↔ Renderer
- **Single Instance Lock**
