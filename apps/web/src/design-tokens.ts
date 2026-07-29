export const designTokens = {
  colorBrand: "#3370FF",
  colorBrandHover: "#2859D9",
  colorBrandActive: "#1F49B6",
  colorBrandSoft: "#EAF2FF",
  colorBrandSelected: "#E7F0FF",
  colorPage: "#F5F6F8",
  colorSurface: "#FFFFFF",
  colorSidebar: "#F7F8FA",
  colorText: "#1F2329",
  colorTextSecondary: "#646A73",
  colorTextMuted: "#8F959E",
  colorBorder: "#E5E6EB",
  colorDivider: "#EFF0F1",
  colorWarning: "#F5A623",
  colorDanger: "#F54A45",
  colorSuccess: "#34C759",
  colorPurple: "#7C5CFC",
  colorCyan: "#14B8A6",
  colorOrange: "#FF7D00",
  shadowCard: "0 4px 16px rgb(31 35 41 / 5%)",
  radiusSmall: "10px",
  radiusMedium: "12px",
  radiusLarge: "16px",
  sidebarCollapsed: "84px",
  sidebarExpanded: "204px",
  topbarHeight: "60px",
  contentMaxWidth: "1440px"
} as const;

const cssVariableNames: Record<keyof typeof designTokens, string> = {
  colorBrand: "--color-brand",
  colorBrandHover: "--color-brand-hover",
  colorBrandActive: "--color-brand-active",
  colorBrandSoft: "--color-brand-soft",
  colorBrandSelected: "--color-brand-selected",
  colorPage: "--color-page",
  colorSurface: "--color-surface",
  colorSidebar: "--color-sidebar",
  colorText: "--color-text",
  colorTextSecondary: "--color-text-secondary",
  colorTextMuted: "--color-text-muted",
  colorBorder: "--color-border",
  colorDivider: "--color-divider",
  colorWarning: "--color-warning",
  colorDanger: "--color-danger",
  colorSuccess: "--color-success",
  colorPurple: "--color-purple",
  colorCyan: "--color-cyan",
  colorOrange: "--color-orange",
  shadowCard: "--shadow-card",
  radiusSmall: "--radius-small",
  radiusMedium: "--radius-medium",
  radiusLarge: "--radius-large",
  sidebarCollapsed: "--sidebar-collapsed",
  sidebarExpanded: "--sidebar-expanded",
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
    colorPrimaryActive: designTokens.colorBrandActive,
    colorInfo: designTokens.colorBrand,
    colorSuccess: designTokens.colorSuccess,
    colorWarning: designTokens.colorWarning,
    colorError: designTokens.colorDanger,
    colorText: designTokens.colorText,
    colorTextSecondary: designTokens.colorTextSecondary,
    colorBgLayout: designTokens.colorPage,
    colorBgContainer: designTokens.colorSurface,
    colorBorder: designTokens.colorBorder,
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily:
      '"Microsoft YaHei UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  components: {
    Button: {
      controlHeightLG: 42,
      borderRadiusLG: 10,
      primaryShadow: "none"
    },
    Card: {
      borderRadiusLG: 14
    },
    Input: {
      activeShadow: "0 0 0 3px rgb(51 112 255 / 12%)"
    },
    Menu: {
      itemBorderRadius: 10,
      itemSelectedBg: designTokens.colorBrandSelected,
      itemSelectedColor: designTokens.colorBrand
    }
  }
} as const;
