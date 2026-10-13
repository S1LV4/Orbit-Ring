import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ring", {
  executeAction: (action: any) => ipcRenderer.send("execute-action", action),
  close: () => ipcRenderer.send("close-ring"),
});
