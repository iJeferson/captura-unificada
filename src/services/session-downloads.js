"use strict";

/**
 * Downloads para a pasta Downloads (sem diálogo). Notifica o launcher: progresso e conclusão.
 * @module services/session-downloads
 */

const { app, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const MAX_RECENT = 25;
const attachedSessions = new WeakSet();
/** @type {Map<string, { name: string, path: string, receivedBytes: number, totalBytes: number }>} */
const activeById = new Map();
/** @type {Array<{ id: string, name: string, path: string, state: string, at: number, receivedBytes?: number, totalBytes?: number }>} */
const recentDone = [];
/** IDs de downloads concluídos que o usuário ainda não “viu” no painel (badge + lista). */
const unviewedCompletedIds = new Set();
let idSeq = 0;

function normalizeDownloadState(s) {
  return String(s || "").toLowerCase();
}

function isPdfPath(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  return /\.pdf$/i.test(path.basename(filePath));
}

function getDownloadsDir() {
  return app.getPath("downloads");
}

function sanitizeFileName(name) {
  const base = path.basename(name || "download");
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "download";
}

function uniqueSavePath(dir, fileName) {
  const safe = sanitizeFileName(fileName);
  let full = path.join(dir, safe);
  if (!fs.existsSync(full)) return full;
  const ext = path.extname(safe);
  const base = path.basename(safe, ext);
  let i = 1;
  let candidate;
  do {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

function isPathUnderDownloads(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  try {
    const resolved = path.resolve(filePath);
    const dl = path.resolve(getDownloadsDir());
    return resolved === dl || resolved.startsWith(dl + path.sep);
  } catch {
    return false;
  }
}

function sendToLauncher(getMainWindow, channel, payload) {
  const win = typeof getMainWindow === "function" ? getMainWindow() : null;
  if (win?.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

/**
 * Lista para o popover: ativos + concluídos recentes.
 */
function getDownloadsSnapshot() {
  const active = [];
  for (const [id, r] of activeById) {
    active.push({
      id,
      name: r.name,
      path: r.path,
      state: "progressing",
      receivedBytes: r.receivedBytes,
      totalBytes: r.totalBytes,
    });
  }
  const done = recentDone.map((x) => ({
    id: x.id,
    name: x.name,
    path: x.path,
    state: normalizeDownloadState(x.state),
    receivedBytes: x.receivedBytes ?? 0,
    totalBytes: x.totalBytes ?? 0,
    at: x.at,
  }));
  return [...active, ...done];
}

function getUnviewedCompletedCount() {
  return unviewedCompletedIds.size;
}

/**
 * Itens para o painel: em andamento + concluídos ainda não visualizados.
 */
function getDownloadsPanelSnapshot() {
  const active = [];
  for (const [id, r] of activeById) {
    if (!isPdfPath(r.path)) continue;
    active.push({
      id,
      name: r.name,
      path: r.path,
      state: "progressing",
      receivedBytes: r.receivedBytes,
      totalBytes: r.totalBytes,
    });
  }
  const unviewedDone = [];
  for (const x of recentDone) {
    if (!unviewedCompletedIds.has(x.id) || !isPdfPath(x.path)) continue;
    unviewedDone.push({
      id: x.id,
      name: x.name,
      path: x.path,
      state: normalizeDownloadState(x.state),
      receivedBytes: x.receivedBytes ?? 0,
      totalBytes: x.totalBytes ?? 0,
      at: x.at,
    });
  }
  return [...active, ...unviewedDone];
}

function markDownloadsPanelViewed() {
  unviewedCompletedIds.clear();
}

function showItemInFolder(filePath) {
  if (!isPathUnderDownloads(filePath)) return false;
  try {
    if (!fs.existsSync(filePath)) return false;
    shell.showItemInFolder(filePath);
    return true;
  } catch {
    return false;
  }
}

function openDownloadsFolder() {
  try {
    shell.openPath(getDownloadsDir());
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import("electron").Session} electronSession
 * @param {() => import("electron").BrowserWindow|null} getMainWindow
 */
function registerSessionDownloadHandler(electronSession, getMainWindow) {
  if (!electronSession || attachedSessions.has(electronSession)) return;
  attachedSessions.add(electronSession);

  electronSession.on("will-download", (_event, item) => {
    const dir = getDownloadsDir();
    const savePath = uniqueSavePath(dir, item.getFilename());
    item.setSavePath(savePath);

    const id = `dl-${++idSeq}`;
    const name = path.basename(savePath);
    activeById.set(id, { name, path: savePath, receivedBytes: 0, totalBytes: 0 });

    const notifyPdf = isPdfPath(savePath);

    if (notifyPdf) {
      sendToLauncher(getMainWindow, "download-started", {
        id,
        name,
        path: savePath,
        state: "progressing",
        receivedBytes: 0,
        totalBytes: 0,
      });
    }

    const pushProgress = () => {
      const rec = activeById.get(id);
      if (!rec) return;
      rec.receivedBytes = item.getReceivedBytes();
      rec.totalBytes = item.getTotalBytes();
      if (notifyPdf) {
        sendToLauncher(getMainWindow, "download-progress", {
          id,
          name,
          path: savePath,
          receivedBytes: rec.receivedBytes,
          totalBytes: rec.totalBytes,
          state: "progressing",
        });
      }
    };

    pushProgress();
    item.on("updated", () => {
      pushProgress();
    });

    item.once("done", (_e, state) => {
      const rec = activeById.get(id);
      const total = rec?.totalBytes ?? item.getTotalBytes();
      const received = rec?.receivedBytes ?? item.getReceivedBytes();
      activeById.delete(id);

      const doneEntry = {
        id,
        name,
        path: savePath,
        state: normalizeDownloadState(state),
        at: Date.now(),
        receivedBytes: received,
        totalBytes: total,
      };
      recentDone.unshift(doneEntry);
      while (recentDone.length > MAX_RECENT) recentDone.pop();

      if (normalizeDownloadState(state) === "completed" && isPdfPath(savePath)) {
        unviewedCompletedIds.add(id);
      }

      if (notifyPdf) {
        sendToLauncher(getMainWindow, "download-finished", {
          id,
          name,
          path: savePath,
          state: normalizeDownloadState(state),
          receivedBytes: received,
          totalBytes: total,
        });
      }
    });
  });
}

module.exports = {
  registerSessionDownloadHandler,
  getDownloadsSnapshot,
  getDownloadsPanelSnapshot,
  getUnviewedCompletedCount,
  markDownloadsPanelViewed,
  showItemInFolder,
  openDownloadsFolder,
  isPathUnderDownloads,
};
