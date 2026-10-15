import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("orbit", {
  serviceToken: (): string => ipcRenderer.sendSync("service-token"),
});
