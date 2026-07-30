const SENSITIVE_ASSIGNMENT =
  /(["']?(?:app_?secret|asset_?token|pairing_?(?:key|secret))["']?\s*[:=]\s*)(["']?)([^"',\s}]+)/gi;
const ACCESS_TOKEN_QUERY = /([?&]access_token=)[^&\s]+/gi;
const AUTHORIZATION_HEADER =
  /(authorization["']?\s*[:=]\s*)(?:["']?bearer\s+)?["']?([^"',\s}]+)/gi;
const BEARER_TOKEN = /(bearer\s+)[a-z0-9._~+/-]+/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(AUTHORIZATION_HEADER, "$1[REDACTED]")
    .replace(BEARER_TOKEN, "$1[REDACTED]")
    .replace(SENSITIVE_ASSIGNMENT, "$1$2[REDACTED]")
    .replace(ACCESS_TOKEN_QUERY, "$1[REDACTED]");
}
