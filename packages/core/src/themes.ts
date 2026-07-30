import type { ThemeId } from "./types.js";

const BASE_CSS = `
#crosspost-root {
  box-sizing: border-box;
  color: #1f2328;
  font-size: 16px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
#crosspost-root * { box-sizing: border-box; }
#crosspost-root img { height: auto; max-width: 100%; }
#crosspost-root img[data-crosspost-formula="inline"] {
  display: inline-block;
  height: 1em;
  margin: 0 0.08em;
  vertical-align: -0.12em;
  width: auto;
}
#crosspost-root p[data-crosspost-formula-block="true"] { text-align: center; }
#crosspost-root img[data-crosspost-formula="block"] {
  display: inline-block;
  margin: 1em auto;
}
#crosspost-root pre {
  overflow-x: auto;
  padding: 1em;
  white-space: pre;
}
#crosspost-root table {
  border-collapse: collapse;
  width: 100%;
}
#crosspost-root th, #crosspost-root td {
  border: 1px solid #d0d7de;
  padding: 0.45em 0.65em;
}
#crosspost-root blockquote {
  margin-left: 0;
  padding-left: 1em;
}
`;

const THEMES: Record<ThemeId, string> = {
  minimal: `
${BASE_CSS}
#crosspost-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { line-height: 1.3; }
#crosspost-root h2 { border-bottom: 1px solid #d8dee4; padding-bottom: 0.3em; }
#crosspost-root blockquote { border-left: 4px solid #8c959f; color: #57606a; }
#crosspost-root code { background: #f6f8fa; border-radius: 4px; padding: 0.12em 0.3em; }
#crosspost-root pre { background: #f6f8fa; border-radius: 8px; }
`,
  academic: `
${BASE_CSS}
#crosspost-root { font-family: Georgia, "Noto Serif CJK SC", "Songti SC", serif; }
#crosspost-root h1 { text-align: center; }
#crosspost-root h2 { border-bottom: 2px solid #6b4f3a; color: #4f3828; padding-bottom: 0.25em; }
#crosspost-root blockquote { border-left: 4px solid #ad8b73; color: #5d4b3e; }
#crosspost-root code { background: #f7f2ed; border-radius: 3px; padding: 0.12em 0.3em; }
#crosspost-root pre { background: #f7f2ed; border: 1px solid #eadfd5; }
`,
  tech: `
${BASE_CSS}
#crosspost-root { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #0b5fff; }
#crosspost-root h2 { border-left: 5px solid #0b5fff; padding-left: 0.55em; }
#crosspost-root blockquote { background: #f0f6ff; border-left: 4px solid #0b5fff; padding: 0.75em 1em; }
#crosspost-root code { background: #eef3f8; border-radius: 4px; padding: 0.12em 0.3em; }
#crosspost-root pre { background: #0d1117; color: #e6edf3; border-radius: 8px; }
`
};

export function getThemeCss(theme: ThemeId): string {
  return THEMES[theme];
}

export const themeIds = Object.keys(THEMES) as ThemeId[];
