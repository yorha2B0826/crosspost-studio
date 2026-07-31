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
`,
  warm: `
${BASE_CSS}
#crosspost-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #c2410c; line-height: 1.35; }
#crosspost-root h1 { border-bottom: 3px solid #fbbf24; padding-bottom: 0.3em; }
#crosspost-root h2 { border-bottom: 2px solid #fed7aa; padding-bottom: 0.25em; }
#crosspost-root h3 { color: #9a3412; }
#crosspost-root a { color: #d97706; font-weight: 500; }
#crosspost-root blockquote { background: #fff7ed; border-left: 4px solid #f97316; border-radius: 0 6px 6px 0; color: #7c2d12; padding: 0.75em 1em; }
#crosspost-root code { background: #fff7ed; border-radius: 4px; color: #9a3412; padding: 0.12em 0.35em; }
#crosspost-root pre { background: #1c1917; color: #f59e0b; border-radius: 8px; }
#crosspost-root table { border-color: #fed7aa; }
#crosspost-root th { background: #fff7ed; color: #9a3412; }
`,
  bold: `
${BASE_CSS}
#crosspost-root { font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 450; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #111827; font-weight: 800; letter-spacing: -0.02em; }
#crosspost-root h1 { font-size: 2.2em; line-height: 1.15; margin-bottom: 0.4em; }
#crosspost-root h2 { border-bottom: 3px solid #111827; font-size: 1.5em; line-height: 1.25; margin-top: 1.5em; padding-bottom: 0.35em; }
#crosspost-root h3 { font-size: 1.2em; }
#crosspost-root a { color: #1d4ed8; font-weight: 600; }
#crosspost-root blockquote { border-left: 6px solid #d1d5db; color: #374151; font-style: italic; margin: 1.2em 0; padding: 0.6em 1.2em; }
#crosspost-root code { background: #111827; border-radius: 3px; color: #f9fafb; font-size: 0.9em; padding: 0.12em 0.4em; }
#crosspost-root pre { background: #111827; color: #f9fafb; border-radius: 8px; font-size: 0.92em; }
#crosspost-root pre code { background: transparent; color: inherit; padding: 0; }
#crosspost-root table { border-color: #d1d5db; }
#crosspost-root th { background: #111827; color: #f9fafb; font-weight: 700; text-transform: uppercase; }
#crosspost-root ul > li::marker { color: #1d4ed8; }
`,
  elegant: `
${BASE_CSS}
#crosspost-root { font-family: "Libre Baskerville", Georgia, "Noto Serif CJK SC", "Songti SC", serif; color: #2d2a26; line-height: 1.85; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #1a1917; font-weight: 600; }
#crosspost-root h1 { font-size: 2em; letter-spacing: -0.01em; margin-bottom: 0.5em; text-align: center; }
#crosspost-root h1::after { content: ""; display: block; background: linear-gradient(90deg, #c9b99a, #8c7b5e, #c9b99a); height: 2px; margin: 0.6em auto 0; width: 60%; }
#crosspost-root h2 { border-bottom: 1px solid #d6cfc3; color: #5a4e3c; font-size: 1.45em; padding-bottom: 0.3em; }
#crosspost-root a { color: #7c6e54; font-style: italic; }
#crosspost-root blockquote { border-left: 3px solid #c9b99a; color: #6b5f4f; font-style: italic; padding: 0.5em 1.2em; }
#crosspost-root code { background: #f5efe6; border: 1px solid #e5dcd0; border-radius: 3px; color: #7c6e54; font-family: "Source Code Pro", "Cascadia Code", monospace; padding: 0.12em 0.4em; }
#crosspost-root pre { background: #faf7f2; border: 1px solid #e5dcd0; border-radius: 8px; color: #3d382e; font-family: "Source Code Pro", "Cascadia Code", monospace; }
#crosspost-root table { border-color: #d6cfc3; }
#crosspost-root th { background: #f5efe6; color: #5a4e3c; font-weight: 600; }
`,
  fresh: `
${BASE_CSS}
#crosspost-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #064e3b; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #065f46; line-height: 1.35; }
#crosspost-root h1 { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 8px; padding: 0.4em 0.6em; }
#crosspost-root h2 { background: linear-gradient(to right, #a7f3d0, transparent); border-left: 4px solid #059669; color: #064e3b; padding: 0.25em 0.6em; }
#crosspost-root a { color: #059669; font-weight: 500; }
#crosspost-root a:hover { color: #047857; text-decoration-color: #6ee7b7; }
#crosspost-root blockquote { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 0 8px 8px 0; border-left: 4px solid #059669; color: #065f46; padding: 0.75em 1em; }
#crosspost-root code { background: #ecfdf5; border-radius: 4px; color: #047857; padding: 0.12em 0.35em; }
#crosspost-root pre { background: #022c22; color: #d1fae5; border-radius: 8px; }
#crosspost-root table { border-color: #a7f3d0; }
#crosspost-root th { background: #ecfdf5; color: #047857; }
`,
  dark: `
${BASE_CSS}
#crosspost-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1117; color: #e6edf3; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #f0f6fc; line-height: 1.35; }
#crosspost-root h2 { border-bottom: 1px solid #30363d; padding-bottom: 0.3em; }
#crosspost-root a { color: #58a6ff; font-weight: 500; }
#crosspost-root blockquote { border-left: 4px solid #3fb950; color: #8b949e; padding: 0.5em 1em; }
#crosspost-root code { background: #161b22; border: 1px solid #30363d; border-radius: 4px; color: #ffa657; padding: 0.12em 0.35em; }
#crosspost-root pre { background: #161b22; border: 1px solid #30363d; border-radius: 8px; color: #e6edf3; }
#crosspost-root table { border-color: #30363d; }
#crosspost-root th { background: #161b22; color: #f0f6fc; }
#crosspost-root th, #crosspost-root td { border-color: #30363d; }
`,
  zen: `
${BASE_CSS}
#crosspost-root { font-family: "Noto Serif CJK SC", "Songti SC", Georgia, serif; color: #1f242e; font-size: 17px; line-height: 2; max-width: 42em; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #0b1940; font-weight: 400; }
#crosspost-root h1 { font-size: 1.8em; margin-bottom: 0.7em; text-align: center; }
#crosspost-root h1::after { content: "—"; display: block; color: #9ca3af; font-size: 0.6em; margin-top: 0.35em; }
#crosspost-root h2 { font-size: 1.25em; margin-top: 1.8em; }
#crosspost-root h2::before { content: "§ "; color: #9ca3af; font-size: 0.8em; }
#crosspost-root a { color: #4b5563; font-style: italic; text-decoration-color: #d1d5db; }
#crosspost-root blockquote { border-left: none; color: #6b7280; font-style: italic; margin: 1.2em 0; padding: 0 1.2em; position: relative; }
#crosspost-root blockquote::before { color: #e5e7eb; content: open-quote; font-size: 3em; left: -0.15em; line-height: 0; position: absolute; top: 0.35em; }
#crosspost-root code { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 3px; color: #6b7280; font-family: "Source Code Pro", monospace; font-size: 0.88em; padding: 0.1em 0.35em; }
#crosspost-root pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; }
#crosspost-root table { border-color: #e5e7eb; }
#crosspost-root th { background: #f9fafb; color: #374151; font-weight: 500; }
`,
  ocean: `
${BASE_CSS}
#crosspost-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0c4a6e; }
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 { color: #082f49; line-height: 1.35; }
#crosspost-root h1 { background: linear-gradient(135deg, #e0f2fe, #bae6fd); border-radius: 8px; padding: 0.4em 0.6em; }
#crosspost-root h2 { border-bottom: 3px solid #38bdf8; color: #0369a1; padding-bottom: 0.25em; }
#crosspost-root h3 { color: #0284c7; }
#crosspost-root a { color: #0284c7; font-weight: 500; text-decoration-color: #7dd3fc; }
#crosspost-root blockquote { background: linear-gradient(90deg, #f0f9ff, transparent); border-left: 4px solid #38bdf8; color: #0c4a6e; padding: 0.75em 1em; }
#crosspost-root code { background: #f0f9ff; border-radius: 4px; color: #0369a1; padding: 0.12em 0.35em; }
#crosspost-root pre { background: #082f49; color: #bae6fd; border-radius: 8px; }
#crosspost-root table { border-color: #bae6fd; }
#crosspost-root th { background: #f0f9ff; color: #0369a1; }
`
};

export function getThemeCss(theme: ThemeId): string {
  return THEMES[theme];
}

export const themeIds = Object.keys(THEMES) as ThemeId[];
