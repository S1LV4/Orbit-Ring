import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { t } from "./i18n";

const splash = document.getElementById("splash");
if (splash) {
  const status = splash.querySelector(".status");
  if (status) status.textContent = t("app.splash.loading");
  splash.dataset.ready = t("app.splash.ready");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
