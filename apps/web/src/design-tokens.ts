export const designTokens = {
  colorBrand: "#3370FF",
  colorBrandHover: "#2859D9",
  colorBrandSoft: "#EEF4FF",
  colorSurface: "#FFFFFF",
  colorPage: "#F5F6F8",
  colorText: "#1F2329",
  colorTextSecondary: "#646A73",
  colorBorder: "#E5E6EB",
  colorWarning: "#F5A623",
  colorDanger: "#F54A45",
  radiusSmall: "10px",
  radiusMedium: "12px",
  sidebarWidth: "68px",
  topbarHeight: "62px",
  contentMaxWidth: "1440px"
} as const;

const cssVariableNames: Record<keyof typeof designTokens, string> = {
  colorBrand: "--color-brand",
  colorBrandHover: "--color-brand-hover",
  colorBrandSoft: "--color-brand-soft",
  colorSurface: "--color-surface",
  colorPage: "--color-page",
  colorText: "--color-text",
  colorTextSecondary: "--color-text-secondary",
  colorBorder: "--color-border",
  colorWarning: "--color-warning",
  colorDanger: "--color-danger",
  radiusSmall: "--radius-small",
  radiusMedium: "--radius-medium",
  sidebarWidth: "--sidebar-width",
  topbarHeight: "--topbar-height",
  contentMaxWidth: "--content-max-width"
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
    colorSuccess: designTokens.colorBrand,
    colorWarning: designTokens.colorWarning,
    colorError: designTokens.colorDanger,
    colorText: designTokens.colorText,
    colorTextSecondary: designTokens.colorTextSecondary,
    colorBgLayout: designTokens.colorPage,
    colorBgContainer: designTokens.colorSurface,
    colorBorder: designTokens.colorBorder,
    borderRadius: 10,
    borderRadiusLG: 12,
    fontSize: 14,
    fontFamily:
      '"Nunito", "Microsoft YaHei UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  components: {
    Button: {
      controlHeight: 34,
      controlHeightLG: 40,
      borderRadius: 8,
      borderRadiusLG: 10,
      primaryShadow: "none"
    },
    Card: {
      borderRadiusLG: 12
    },
    Input: {
      activeShadow: "0 0 0 3px rgb(51 112 255 / 12%)"
    }
  }
} as const;
