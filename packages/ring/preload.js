"use strict";

// packages/ring/src/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("ring", {
  executeAction: (action) => import_electron.ipcRenderer.send("execute-action", action),
  close: () => import_electron.ipcRenderer.send("close-ring"),
  hideWindow: () => import_electron.ipcRenderer.send("hide-ring"),
  hidden: () => import_electron.ipcRenderer.send("ring-hidden"),
  onShow: (cb) => import_electron.ipcRenderer.on("ring-show", (_e, data) => cb(data)),
  onHide: (cb) => import_electron.ipcRenderer.on("ring-hide", () => cb()),
  onRelease: (cb) => import_electron.ipcRenderer.on("ring-release", () => cb()),
  onConfig: (cb) => import_electron.ipcRenderer.on("ring-config", (_e, slots) => cb(slots))
});
