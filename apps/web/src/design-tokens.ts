export const designTokens = {
  colorBrand: "#3370FF",
  colorBrandHover: "#2859D9",
  colorBrandSoft: "#EEF4FF",
  colorSurface: "#FFFFFF",
  colorPage: "#F6F8FC",
  colorText: "#1F2329",
  colorTextSecondary: "#646A73",
  colorTextMuted: "#8F959E",
  colorBorder: "#E5E6EB",
  colorDivider: "#EFF0F2",
  colorSuccess: "#2E9B63",
  colorWarning: "#F5A623",
  colorDanger: "#F54A45",
  radiusSmall: "16px",
  radiusMedium: "28px",
  radiusPill: "999px",
  sidebarWidth: "210px",
  contentMaxWidth: "1660px",
  fontUi:
    '"HarmonyOS Sans SC", "HarmonyOS Sans", "Microsoft YaHei UI", "PingFang SC", "Microsoft YaHei", sans-serif'
} as const;

const cssVariableNames: Record<keyof typeof designTokens, string> = {
  colorBrand: "--color-brand",
  colorBrandHover: "--color-brand-hover",
  colorBrandSoft: "--color-brand-soft",
  colorSurface: "--color-surface",
  colorPage: "--color-page",
  colorText: "--color-text",
  colorTextSecondary: "--color-text-secondary",
  colorTextMuted: "--color-text-muted",
  colorBorder: "--color-border",
  colorDivider: "--color-divider",
  colorSuccess: "--color-success",
  colorWarning: "--color-warning",
  colorDanger: "--color-danger",
  radiusSmall: "--radius-small",
  radiusMedium: "--radius-medium",
  radiusPill: "--radius-pill",
  sidebarWidth: "--sidebar-width",
  contentMaxWidth: "--content-max-width",
  fontUi: "--font-ui"
};

export function installDesignTokens(root: HTMLElement): void {
  for (const [token, value] of Object.entries(designTokens)) {
    root.style.setProperty(
      cssVariableNames[token as keyof typeof designTokens],
      value
    );
  }
}

export const antdTheme = {
  token: {
    colorPrimary: designTokens.colorBrand,
    colorPrimaryHover: designTokens.colorBrandHover,
    colorPrimaryActive: designTokens.colorBrandHover,
    colorInfo: designTokens.colorBrand,
    colorSuccess: designTokens.colorSuccess,
    colorWarning: designTokens.colorWarning,
    colorError: designTokens.colorDanger,
    colorText: designTokens.colorText,
    colorTextSecondary: designTokens.colorTextSecondary,
    colorBgLayout: designTokens.colorPage,
    colorBgContainer: designTokens.colorSurface,
    colorBorder: designTokens.colorBorder,
    borderRadius: 16,
    borderRadiusLG: 26,
    fontSize: 15,
    fontFamily: designTokens.fontUi
  },
  components: {
    Button: {
      controlHeight: 40,
      controlHeightLG: 46,
      borderRadius: 22,
      borderRadiusLG: 26,
      primaryShadow: "none"
    },
    Card: {
      borderRadiusLG: 28
    },
    Input: {
      activeShadow: "0 0 0 3px rgb(51 112 255 / 12%)"
    }
  }
} as const;
