const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ring", {
  executeAction: (action) => ipcRenderer.send("execute-action", action),
  close: () => ipcRenderer.send("close-ring"),
  hideWindow: () => ipcRenderer.send("hide-ring"),
  setToggleMode: (enabled) => ipcRenderer.send("set-toggle-mode", enabled),
  onShow: (cb) => ipcRenderer.on("ring-show", (_e, data) => cb(data)),
  onHide: (cb) => ipcRenderer.on("ring-hide", () => cb()),
  onRelease: (cb) => ipcRenderer.on("ring-release", () => cb()),
});
