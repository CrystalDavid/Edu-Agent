export const designTokens = {
  colorBrand: "#3370FF",
  colorBrandHover: "#2859D9",
  colorBrandActive: "#214BBB",
  colorBrandSoft: "#E4EEFF",
  colorAiSurface: "#F9FAFB",
  colorSurface: "#FFFFFF",
  colorSurfaceSubtle: "#F3F4F6",
  colorPage: "#FFFFFF",
  colorText: "#1F242B",
  colorTextSecondary: "#586579",
  colorTextMuted: "#8A97A9",
  colorBorder: "#E5E7EB",
  colorBorderStrong: "#D1D5DB",
  colorDivider: "#ECEEF1",
  colorSuccess: "#25835B",
  colorSuccessSoft: "#EAF6EF",
  colorWarning: "#9A6818",
  colorWarningSoft: "#FFF4D8",
  colorDanger: "#C44236",
  colorDangerSoft: "#FCECEA",

  fontDisplay: "32px",
  fontPageTitle: "28px",
  fontSectionTitle: "20px",
  fontContent: "16px",
  fontBody: "15px",
  fontCaption: "13px",
  fontWeightBody: "400",
  fontWeightContent: "500",
  fontWeightSection: "600",
  fontWeightPage: "700",

  space4: "4px",
  space8: "8px",
  space12: "12px",
  space16: "16px",
  space24: "24px",
  space32: "32px",
  space40: "40px",
  space48: "48px",

  radiusSmall: "8px",
  radiusControl: "12px",
  radiusMedium: "16px",
  radiusLarge: "24px",
  radiusPill: "999px",

  shadowLow: "0 1px 2px rgb(42 78 122 / 5%)",
  shadowRaised: "0 8px 24px rgb(42 78 122 / 8%)",
  shadowOverlay: "0 24px 64px rgb(42 78 122 / 15%)",

  sidebarWidth: "168px",
  contentMaxWidth: "1660px",
  fontUi:
    '"Nunito", "Noto Sans SC Variable", "Noto Sans SC", sans-serif'
} as const;

const cssVariableNames: Record<keyof typeof designTokens, string> = {
  colorBrand: "--color-brand",
  colorBrandHover: "--color-brand-hover",
  colorBrandActive: "--color-brand-active",
  colorBrandSoft: "--color-brand-soft",
  colorAiSurface: "--color-ai-surface",
  colorSurface: "--color-surface",
  colorSurfaceSubtle: "--color-surface-subtle",
  colorPage: "--color-page",
  colorText: "--color-text",
  colorTextSecondary: "--color-text-secondary",
  colorTextMuted: "--color-text-muted",
  colorBorder: "--color-border",
  colorBorderStrong: "--color-border-strong",
  colorDivider: "--color-divider",
  colorSuccess: "--color-success",
  colorSuccessSoft: "--color-success-soft",
  colorWarning: "--color-warning",
  colorWarningSoft: "--color-warning-soft",
  colorDanger: "--color-danger",
  colorDangerSoft: "--color-danger-soft",
  fontDisplay: "--font-display",
  fontPageTitle: "--font-page-title",
  fontSectionTitle: "--font-section-title",
  fontContent: "--font-content",
  fontBody: "--font-body",
  fontCaption: "--font-caption",
  fontWeightBody: "--font-weight-body",
  fontWeightContent: "--font-weight-content",
  fontWeightSection: "--font-weight-section",
  fontWeightPage: "--font-weight-page",
  space4: "--space-4",
  space8: "--space-8",
  space12: "--space-12",
  space16: "--space-16",
  space24: "--space-24",
  space32: "--space-32",
  space40: "--space-40",
  space48: "--space-48",
  radiusSmall: "--radius-small",
  radiusControl: "--radius-control",
  radiusMedium: "--radius-medium",
  radiusLarge: "--radius-large",
  radiusPill: "--radius-pill",
  shadowLow: "--shadow-low",
  shadowRaised: "--shadow-raised",
  shadowOverlay: "--shadow-overlay",
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
  // Compatibility aliases for legacy detail screens. Core V3 pages use the
  // semantic tokens above; these aliases keep non-migrated routes readable.
  root.style.setProperty("--shadow-card", designTokens.shadowLow);
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
    colorTextTertiary: designTokens.colorTextMuted,
    colorBgLayout: designTokens.colorPage,
    colorBgContainer: designTokens.colorSurface,
    colorFillSecondary: designTokens.colorSurfaceSubtle,
    colorBorder: designTokens.colorBorder,
    colorSplit: designTokens.colorDivider,
    borderRadius: 12,
    borderRadiusLG: 16,
    borderRadiusSM: 8,
    fontSize: 15,
    fontSizeHeading1: 28,
    fontSizeHeading2: 20,
    fontSizeHeading3: 16,
    fontWeightStrong: 600,
    lineHeight: 1.6,
    controlHeight: 40,
    controlHeightLG: 44,
    boxShadow: designTokens.shadowRaised,
    boxShadowSecondary: designTokens.shadowOverlay,
    fontFamily: designTokens.fontUi
  },
  components: {
    Button: {
      controlHeight: 40,
      controlHeightLG: 44,
      controlHeightSM: 32,
      borderRadius: 12,
      borderRadiusLG: 12,
      borderRadiusSM: 8,
      fontSize: 15,
      fontSizeLG: 15,
      primaryShadow: "none",
      defaultShadow: "none"
    },
    Card: {
      borderRadiusLG: 16,
      boxShadow: designTokens.shadowLow
    },
    Drawer: {
      borderRadiusLG: 24
    },
    Input: {
      borderRadius: 12,
      activeShadow: "0 0 0 3px rgb(51 112 255 / 12%)"
    },
    Modal: {
      borderRadiusLG: 24
    },
    Select: {
      borderRadius: 12,
      optionSelectedBg: designTokens.colorBrandSoft
    },
    Table: {
      headerBg: designTokens.colorSurfaceSubtle,
      headerColor: designTokens.colorTextMuted,
      rowHoverBg: designTokens.colorSurfaceSubtle,
      borderColor: designTokens.colorDivider
    },
    Tabs: {
      itemColor: designTokens.colorTextSecondary,
      itemSelectedColor: designTokens.colorText,
      itemHoverColor: designTokens.colorText
    },
    Tag: {
      borderRadiusSM: 999,
      defaultBg: designTokens.colorSurfaceSubtle,
      defaultColor: designTokens.colorTextSecondary
    }
  }
} as const;
