import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ring", {
  executeAction: (action: any) => ipcRenderer.send("execute-action", action),
  close: () => ipcRenderer.send("close-ring"),
  hideWindow: () => ipcRenderer.send("hide-ring"),
  hidden: () => ipcRenderer.send("ring-hidden"),
  onShow: (cb: (data: any) => void) => ipcRenderer.on("ring-show", (_e, data) => cb(data)),
  onHide: (cb: () => void) => ipcRenderer.on("ring-hide", () => cb()),
  onRelease: (cb: () => void) => ipcRenderer.on("ring-release", () => cb()),
  onConfig: (cb: (slots: any[]) => void) => ipcRenderer.on("ring-config", (_e, slots) => cb(slots)),
});
