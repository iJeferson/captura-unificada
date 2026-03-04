# Captura Unificada

**Launcher de sistemas integrados** — aplicação desktop que centraliza o acesso a CapturaWeb, SMART (CIN), Doc Avulsos, Validação, Ponto Valid, Ponto Renova e Atende.

---

## Funcionalidades

- **Launcher unificado**: CapturaWeb, SMART (CIN), Doc Avulsos, Validação, Ponto Valid, Ponto Renova e Atende
- **Integração com hardware**: CapturaWeb (Suprema) e SMART (Griaule BCC) com preparação automática; Doc Avulsos e Validação com ações mínimas
- **Conectividade**: verificação periódica de rede; aviso offline quando sem conexão
- **Logs de erro**: em AppData (`captura-unificada-data/Logs`), um arquivo por data
- **Atualização automática**: via GitHub, notificação quando pronta
- **Informações do sistema**: hostname, IP, AnyDesk na interface
- **Atende**: janela separada, configuração de IP em arquivo
- **Instância única**: uma janela por vez
- **Tema claro/escuro**: persistência da preferência
- **Sidebar colapsável**: menu lateral recolhível

---

## Requisitos

- Node.js (ver `engines` em `package.json`)
- Windows (build `win x64`)

---

## Estrutura

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
│   │   └── connectivity.service.js
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

## Build

```bash
npm run build
```

Gera `dist/Captura-Unificada-Setup.exe`. O app aparece como **Captura Unificada** no Windows.

---

## Configuração

URLs, delays e caminhos em `src/config/app.config.js`.

---

## Autor

Jeferson Oliveira — © 2026
