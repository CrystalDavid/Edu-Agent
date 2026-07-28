export const DEFAULT_API_BASE_URL = "";

export class ApiConfigurationError extends Error {
  readonly code = "INVALID_API_BASE_URL";

  constructor(message: string) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

export function resolveApiUrl(
  route: string,
  configuredBaseUrl: string | undefined,
  browserOrigin: string
): string {
  const baseUrl = configuredBaseUrl?.trim();
  if (!baseUrl) {
    return route;
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new ApiConfigurationError(
      "VITE_API_BASE_URL 必须是包含 http:// 或 https:// 的完整源地址。"
    );
  }

  if (!["http:", "https:"].includes(parsedBase.protocol)) {
    throw new ApiConfigurationError(
      "VITE_API_BASE_URL 只允许 http:// 或 https:// 地址。"
    );
  }
  if (
    parsedBase.username ||
    parsedBase.password ||
    parsedBase.search ||
    parsedBase.hash
  ) {
    throw new ApiConfigurationError(
      "VITE_API_BASE_URL 不得包含凭据、查询参数或片段。"
    );
  }

  const browser = new URL(browserOrigin);
  const targetOrigin = parsedBase.origin || browser.origin;
  return new URL(route, `${targetOrigin}/`).toString();
}
