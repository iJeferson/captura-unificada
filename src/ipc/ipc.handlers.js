/**
 * @fileoverview Handlers IPC - comunicação Main Process ↔ Renderer
 * @module ipc/ipc.handlers
 *
 * Responsabilidade: Registrar e processar todas as mensagens IPC
 * entre a janela principal (UI) e o processo principal.
 */

const { ipcMain, session } = require("electron");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const { autoUpdater } = require("electron-updater");
const config = require("../config/app.config");
const execAsync = promisify(exec);
const {
  configurarAmbienteCaptura,
  configurarAmbienteSmart,
  reiniciarServicoHardware,
  reiniciarBCC,
} = require("../services/hardware.service");
const { getSystemInfo } = require("../services/system.service");
const { getAtendeConfig, setAtendeConfig, buildAtendeUrl } = require("../services/atende.service");
const windowManager = require("../window/window.manager");

/**
 * Registra todos os handlers IPC.
 * Deve ser chamado após a janela estar criada.
 */
function registerIpcHandlers() {
  const contentView = windowManager.getContentView();
  const mainWindow = windowManager.getMainWindow();

  /**
   * Handler: resize-sidebar
   * Atualiza a largura da sidebar e redimensiona o contentView.
   */
  ipcMain.on("resize-sidebar", (_, width) => {
    windowManager.setCurrentSidebarWidth(width);
    windowManager.ajustarView();
  });

  /**
   * Handler: captura
   * Inicia o sistema CapturaWeb: para BCC/Java, reinicia serviço e cicla o Suprema RealScan-D, depois carrega a URL.
   */
  ipcMain.handle("captura", async () => {
    if (windowManager.getProcessandoTroca()) return;

    windowManager.setProcessandoTroca(true);
    windowManager.setSistemaIniciado(true);
    windowManager.setCurrentSistema("captura");
    windowManager.setContentViewVisible(false);

    await configurarAmbienteCaptura();
    windowManager.loadContentViewUrl(config.URLS.capturaWeb);
    windowManager.ajustarView();
  });

  /**
   * Handler: smart
   * Inicia o sistema SMART (CIN): configura hardware e carrega a URL.
   */
  ipcMain.handle("smart", async () => {
    if (windowManager.getProcessandoTroca()) return;

    windowManager.setProcessandoTroca(true);
    windowManager.setSistemaIniciado(true);
    windowManager.setCurrentSistema("smart");
    windowManager.setContentViewVisible(false);

    await configurarAmbienteSmart();
    windowManager.loadContentViewUrl(config.URLS.smart);
    windowManager.ajustarView();
  });

  /**
   * Handler: doc-avulsos
   * Doc Avulsos - usa ambiente Captura (Suprema).
   */
  ipcMain.handle("doc-avulsos", async () => {
    if (windowManager.getProcessandoTroca()) return;

    windowManager.setProcessandoTroca(true);
    windowManager.setSistemaIniciado(true);
    windowManager.setCurrentSistema("doc-avulsos");
    windowManager.setContentViewVisible(false);

    await configurarAmbienteCaptura();
    windowManager.loadContentViewUrl(config.URLS.docAvulsos);
    windowManager.ajustarView();
  });

  /**
   * Verifica se o processo CapturaWeb (externo, Valid) está em execução.
   * Se não estiver, abre o executável configurado (CAPTURAWEB_VALIDACAO_EXE).
   */
  async function garantirCapturaWebValidacaoRodando() {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq CapturaWeb.exe"');
      const estaRodando = stdout.trim().toLowerCase().includes("capturaweb.exe");
      if (estaRodando) return;

      const exePath = config.CAPTURAWEB_VALIDACAO_EXE;
      spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
      await new Promise((r) => setTimeout(r, 1500));
    } catch (_) {
      const exePath = config.CAPTURAWEB_VALIDACAO_EXE;
      spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  /**
   * Handler: validacao
   * Validação - usa ambiente Captura (Suprema).
   * Antes de abrir a URL, verifica se o CapturaWeb externo (Valid) está aberto; se não, abre-o.
   */
  ipcMain.handle("validacao", async () => {
    if (windowManager.getProcessandoTroca()) return;

    windowManager.setProcessandoTroca(true);
    windowManager.setSistemaIniciado(true);
    windowManager.setCurrentSistema("validacao");
    windowManager.setContentViewVisible(false);

    await garantirCapturaWebValidacaoRodando();
    await configurarAmbienteCaptura();
    windowManager.loadContentViewUrl(config.URLS.validacao);
    windowManager.ajustarView();
  });

  /**
   * Handler: ponto-valid
   * Ponto Valid - sem config de hardware.
   */
  ipcMain.handle("ponto-valid", async () => {
    if (windowManager.getProcessandoTroca()) return;

    windowManager.setProcessandoTroca(true);
    windowManager.setSistemaIniciado(true);
    windowManager.setCurrentSistema("ponto-valid");
    windowManager.setContentViewVisible(false);

    windowManager.loadContentViewUrl(config.URLS.pontoValid);
    windowManager.ajustarView();
  });

  /**
   * Handler: ponto-renova
   * Ponto Renova - sem config de hardware.
   */
  ipcMain.handle("ponto-renova", async () => {
    if (windowManager.getProcessandoTroca()) return;

    windowManager.setProcessandoTroca(true);
    windowManager.setSistemaIniciado(true);
    windowManager.setCurrentSistema("ponto-renova");
    windowManager.setContentViewVisible(false);

    windowManager.loadContentViewUrl(config.URLS.pontoRenova);
    windowManager.ajustarView();
  });

  /**
   * Handler: atende
   * Atende - carrega URL do arquivo no Desktop (http://IP/guiche.asp?auto=1).
   * Retorna { needsConfig: true } se IP não estiver configurado.
   */
  ipcMain.handle("atende", async () => {
    const cfg = getAtendeConfig();
    if (!cfg?.ip) {
      return { needsConfig: true };
    }

    const url = buildAtendeUrl(cfg.ip);
    const result = windowManager.openOrFocusAtendeWindow(url);

    if (result.alreadyOpen) {
      return { needsConfig: false };
    }

    return { needsConfig: false };
  });

  ipcMain.handle("reload-atende-window", () => {
    windowManager.reloadAtendeWindow();
  });

  ipcMain.handle("atende-window-open-state", () => windowManager.isAtendeWindowOpen());

  /**
   * Handler: atende-get-config
   * Retorna a config do Atende (IP) ou null.
   */
  ipcMain.handle("atende-get-config", () => getAtendeConfig());

  /**
   * Handler: atende-set-config
   * Salva o IP do Atende no arquivo no Desktop.
   */
  ipcMain.handle("atende-set-config", (_, ip) => setAtendeConfig(ip));

  /**
   * Handler: atende-modal-visible
   * Oculta as views quando o modal do Atende abre.
   * Ao fechar, exibe a view do sistema ativo.
   */
  ipcMain.on("atende-modal-visible", (_, ocultar) => {
    if (ocultar) {
      windowManager.setContentViewVisible(false);
    } else if (windowManager.getSistemaIniciado()) {
      windowManager.setContentViewVisible(true);
    }
  });

  /**
   * Handler: system-info
   * Retorna hostname, IP, AnyDesk e versão do app.
   */
  ipcMain.handle("system-info", () => getSystemInfo());

  /**
   * Handler: reload-page
   * Recarrega a view ativa na janela principal (contentView).
   */
  ipcMain.handle("reload-page", () => {
    windowManager.reloadActiveView();
  });

  /**
   * Handler: apply-update-now
   * Encerra o app e aplica a atualização baixada.
   */
  ipcMain.handle("apply-update-now", () => {
    autoUpdater.quitAndInstall();
  });

  /**
   * Handler: reiniciar-validacao
   * Mata o processo CapturaWeb (externo Valid) e abre novamente.
   * Se a view ativa for Validação, recarrega a página após abrir o exe.
   */
  ipcMain.handle("reiniciar-validacao", async () => {
    try {
      await execAsync('taskkill /F /IM CapturaWeb.exe /T');
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 800));
    const exePath = config.CAPTURAWEB_VALIDACAO_EXE;
    spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
    await new Promise((r) => setTimeout(r, 1500));
    if (windowManager.getCurrentSistema() === "validacao") {
      windowManager.reloadContentView();
    }
  });

  /**
   * Handler: reiniciar-servico-hardware
   * Reinicia o serviço Valid-ServicoIntegracaoHardware (CapturaWeb).
   */
  ipcMain.handle("reiniciar-servico-hardware", async () => {
    await reiniciarServicoHardware();
  });

  /**
   * Handler: reiniciar-bcc
   * Mata o processo BCC e inicia novamente (SMART CIN).
   */
  ipcMain.handle("reiniciar-bcc", async () => {
    await reiniciarBCC();
  });

  /**
   * Handler: clear-cache
   * Limpa APENAS a partition persist:captura (sistemas gerais).
   * NÃO limpa o Atende (persist:atende) - ele mantém cache e estado.
   */
  ipcMain.handle("clear-cache", async () => {
    try {
      const ses = session.fromPartition(config.SESSION_PARTITION);
      await ses.clearStorageData();
      if (contentView) {
        windowManager.setContentViewVisible(false);
        windowManager.reloadContentView();
      }
      return true;
    } catch (e) {
      return false;
    }
  });
}

module.exports = { registerIpcHandlers };
