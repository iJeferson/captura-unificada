# Captura Unificada

**Launcher de sistemas integrados** — aplicação desktop em Electron que centraliza o acesso a múltiplos sistemas (CapturaWeb, SMART/CIN e outros), com atualização automática e integração com hardware de biometria.

---

## Visão geral

O **Captura Unificada** funciona como um ponto único de entrada para sistemas corporativos. A interface oferece um menu lateral com atalhos para cada sistema; ao selecionar um item, o app configura o ambiente adequado (drivers/hardware quando necessário) e exibe o conteúdo na área principal. Inclui suporte a tema claro/escuro, informações do sistema (hostname, IP, AnyDesk) e atualização silenciosa.

---

## Funcionalidades

- **Launcher unificado**: abertura de CapturaWeb, SMART (CIN), Doc Avulsos, Validação, Ponto Valid, Ponto Renova e Atende a partir de um único aplicativo.
- **Integração com hardware**: configuração automática de ambiente para Captura (Suprema) e SMART (Griaule BCC), além de suporte a Valid.
- **Atualização automática**: verificação e instalação de novas versões em segundo plano, com notificação quando uma atualização está pronta.
- **Informações do sistema**: exibição de hostname, endereço IP e ID AnyDesk na interface.
- **Atende**: abertura com opção de configurar IP (arquivo no Desktop); suporte a modal de configuração e janela separada quando aplicável.
- **Instância única**: apenas uma janela do aplicativo pode estar aberta; novas tentativas de abertura focam a janela existente.
- **Tema claro/escuro**: alternância de aparência com persistência da preferência.
- **Sidebar colapsável**: menu lateral que pode ser recolhido para ganhar espaço na área de conteúdo.

---

## Requisitos

- **Node.js** (versão compatível com Electron 30)
- **Windows** (build atual voltado para `win x64`)

---

## Estrutura do projeto

```
captura-unificada/
├── main.js                 # Ponto de entrada (Electron)
├── preload.js              # Context Bridge (Main ↔ Renderer)
├── icon.png                # Ícone do aplicativo
├── package.json
│
├── src/                    # Main Process (Node.js)
│   ├── config/
│   │   └── app.config.js   # Constantes e configurações
│   ├── services/
│   │   ├── updater.service.js   # Atualização automática
│   │   ├── hardware.service.js  # Suprema, Griaule BCC, Valid
│   │   ├── system.service.js    # Hostname, IP, AnyDesk
│   │   └── atende.service.js    # Lógica do sistema Atende
│   ├── ipc/
│   │   └── ipc.handlers.js # Handlers IPC (captura, smart, etc.)
│   ├── window/
│   │   └── window.manager.js    # Janela principal e conteúdo
│   └── utils/
│       └── helpers.js      # Utilitários (esperar, AnyDesk, etc.)
│
└── ui/                     # Renderer Process (interface)
    ├── index.html          # Template da interface
    ├── style.css           # Estilos
    ├── app.js              # Inicialização (Controller)
    └── js/
        ├── config/
        │   └── constants.js # IDs, classes, textos
        └── core/            # MVC
            ├── model.js     # Estado da aplicação
            ├── view.js      # Manipulação do DOM
            └── controller.js # Eventos e coordenação
```

Para mais detalhes sobre responsabilidades e fluxo de dados, consulte o arquivo **ARCHITECTURE.md**.

---

## Instalação e execução

### Desenvolvimento

```bash
npm install
npm start
```

### Build (instalador Windows)

```bash
npm run build
```

O instalador NSIS será gerado na pasta `dist/` (ex.: `Captura-Unificada-Setup.exe`). O build está configurado para publicar atualizações em repositório Git (consulte `package.json` → `build.publish` para ajustar destino).

---

## Tecnologias

- **Electron** — aplicação desktop multiplataforma
- **electron-updater** — atualização automática
- **electron-builder** — empacotamento e instalador Windows (NSIS)

A interface usa HTML/CSS/JavaScript com padrão **MVC** e comunicação segura via **Context Bridge** (`window.api`).

---

## Autor e licença

- **Autor:** Jeferson Oliveira  
- **Copyright:** © Jeferson Oliveira — 2026

---

## Observações

- As URLs dos sistemas e demais endpoints são definidas em **src/config/app.config.js**; não são expostas neste README.
- O aplicativo utiliza **partição de sessão** persistente para o conteúdo web quando aplicável, permitindo cache e login separados por contexto.
