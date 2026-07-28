import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { App } from "./App";
import "antd/dist/reset.css";
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
          colorPrimary: "#176f63",
          colorInfo: "#176f63",
          colorText: "#17211f",
          colorTextSecondary: "#65706d",
          colorBgLayout: "#f2f4f1",
          borderRadius: 10,
          fontFamily:
            '"Inter", "Noto Sans SC", "Microsoft YaHei", sans-serif'
        },
        components: {
          Button: {
            controlHeightLG: 46,
            borderRadiusLG: 9
          },
          Card: {
            borderRadiusLG: 14
          },
          Menu: {
            itemBorderRadius: 9,
            itemSelectedBg: "#e8f1ee",
            itemSelectedColor: "#135f55"
          }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>
);
