import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { App } from "./App";
import "antd/dist/reset.css";
import "./fonts.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element.");
}

createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#5b8ff9",
          colorPrimaryHover: "#477be8",
          colorPrimaryActive: "#3767ca",
          colorInfo: "#5b8ff9",
          colorSuccess: "#2f9e68",
          colorWarning: "#a86400",
          colorError: "#d14c4c",
          colorText: "#1f2a37",
          colorTextSecondary: "#667085",
          colorBgLayout: "#f5f7fb",
          colorBorder: "#e3e9f2",
          borderRadius: 12,
          borderRadiusLG: 16,
          fontFamily:
            '"Nunito", "Microsoft YaHei UI", "PingFang SC", "Microsoft YaHei", sans-serif'
        },
        components: {
          Button: {
            controlHeightLG: 46,
            borderRadiusLG: 9
          },
          Card: {
            borderRadiusLG: 16
          },
          Menu: {
            itemBorderRadius: 12,
            itemSelectedBg: "#eaf2ff",
            itemSelectedColor: "#395fae"
          }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>
);
