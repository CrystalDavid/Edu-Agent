import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { App } from "./App";
import { antdTheme, installDesignTokens } from "./design-tokens";
import "antd/dist/reset.css";
import "./fonts.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element.");
}

installDesignTokens(document.documentElement);

createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={antdTheme}
    >
      <App />
    </ConfigProvider>
  </StrictMode>
);
