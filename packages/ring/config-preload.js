"use strict";

var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("orbit", {
  serviceToken: () => import_electron.ipcRenderer.sendSync("service-token")
});
