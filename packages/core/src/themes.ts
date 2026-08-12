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
#crosspost-root svg[data-crosspost-formula="inline"] {
  color: inherit;
  display: inline-block;
  margin: 0 0.08em;
  max-width: 100%;
}
#crosspost-root svg[data-crosspost-formula="block"] {
  color: inherit;
  display: inline-block;
  height: auto;
  margin: 1em auto;
  max-width: 100%;
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

// Shared academic-style heading hierarchy for every theme. The rendered
// headings carry real marker spans (crosspost-part-label / -title,
// crosspost-section-number, crosspost-subsection-marker) injected by the
// renderer; these styles make them look like a reference paper outline.
// Colors are theme-specific; the structure is common.
function headingCss(
  accent: string,
  softBg: string,
  softBorder: string,
  label: string
): string {
  return `
#crosspost-root h1 {
  font-weight: 700;
  line-height: 1.45;
  margin: 2.6em 0 1.2em;
  padding: 0;
  text-align: center;
}
#crosspost-root h1:first-child { margin-top: 0.8em; }
#crosspost-root .crosspost-part-label {
  color: ${label};
  display: block;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.3em;
  margin: 0 0 7px;
  text-transform: uppercase;
}
#crosspost-root .crosspost-part-title {
  color: ${accent};
  display: block;
  font-size: 1.375em;
  font-weight: 700;
  letter-spacing: 0.08em;
}
#crosspost-root h2 {
  background: ${softBg};
  border: 1px solid ${softBorder};
  border-left: 4px solid ${accent};
  color: ${accent};
  font-size: 1.125em;
  font-weight: 700;
  line-height: 1.55;
  margin: 2.1em 0 1em;
  padding: 9px 13px;
  text-align: left;
}
#crosspost-root .crosspost-section-number {
  color: ${label};
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-right: 9px;
  vertical-align: 2px;
}
#crosspost-root h3 {
  background: ${softBg};
  border: 1px solid ${softBorder};
  border-left: 4px solid ${accent};
  color: ${accent};
  font-size: 1.05em;
  font-weight: 700;
  line-height: 1.65;
  margin: 1.6em 0 0.9em;
  padding: 8px 13px;
  text-align: left;
}
#crosspost-root .crosspost-subsection-marker {
  color: ${accent};
  display: inline-block;
  margin-right: 7px;
}
`;
}

const THEMES: Record<ThemeId, string> = {
  minimal: `
${BASE_CSS}
#crosspost-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
${headingCss("#0969da", "#f6f8fa", "#d0d7de", "#57606a")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  border-left: 4px solid #8c959f;
  color: #57606a;
  padding: 0.5em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #0969da;
}
#crosspost-root code {
  background: #f6f8fa;
  border-radius: 4px;
  padding: 0.12em 0.3em;
}
#crosspost-root pre {
  background: #f6f8fa;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #e1e4e8;
  border-radius: 6px;
}
#crosspost-root th {
  background: #f6f8fa;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #d0d7de;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 1px solid #d8dee4;
  margin: 1.8em 0;
}
`,
  academic: `
${BASE_CSS}
#crosspost-root {
  color: #283038;
  font-family: "Songti SC", STSong, "Noto Serif CJK SC", "Source Han Serif SC", SimSun, Georgia, serif;
  font-size: 16px;
  letter-spacing: 0.025em;
  line-height: 1.95;
  margin: 0 auto;
  padding: 4px 5px 28px;
  text-align: justify;
  word-break: normal;
}
#crosspost-root h1 {
  font-weight: 700;
  line-height: 1.45;
  margin: 3.4em 0 1.55em;
  padding: 0;
  text-align: center;
}
#crosspost-root h1:first-child { margin-top: 0.9em; }
#crosspost-root .crosspost-part-label {
  color: #7b8b95;
  display: block;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.3em;
  margin: 0 0 7px;
  text-transform: uppercase;
}
#crosspost-root .crosspost-part-title {
  color: #17364a;
  display: block;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
#crosspost-root h2 {
  background: #f7f9fa;
  border: 1px solid #e2e8ec;
  border-left: 4px solid #315b71;
  color: #18384b;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.055em;
  line-height: 1.55;
  margin: 2.25em 0 1.05em;
  padding: 10px 13px 9px;
  text-align: left;
}
#crosspost-root .crosspost-section-number {
  color: #718793;
  display: inline-block;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-right: 9px;
  vertical-align: 2px;
}
#crosspost-root h3 {
  background: #f4f7f9;
  border: 1px solid #ced9df;
  border-left: 4px solid #315b71;
  color: #17384b;
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 0.035em;
  line-height: 1.65;
  margin: 1.8em 0 1em;
  padding: 12px 14px;
  text-align: left;
}
#crosspost-root .crosspost-subsection-marker {
  color: #315b71;
  display: inline-block;
  font-family: Arial, sans-serif;
  margin-right: 7px;
}
#crosspost-root p {
  color: #2b3339;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.025em;
  line-height: 1.95;
  margin: 0.95em 0;
  padding: 0;
  text-align: justify;
  text-indent: 2em;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f8fafb;
  border: 1px solid #dbe3e8;
  border-left: 3px solid #6d8795;
  line-height: 1.5;
  margin: 1.45em 0;
  overflow-x: auto;
  padding: 14px 10px;
  text-align: center;
  text-indent: 0;
}
#crosspost-root svg[data-crosspost-formula="inline"] {
  margin: 0 0.12em;
  vertical-align: -0.22em;
}
#crosspost-root svg[data-crosspost-formula="block"] { margin: 0 auto; }
#crosspost-root ul, #crosspost-root ol {
  background: #f8fafb;
  border: 1px solid #e0e6ea;
  border-left: 3px solid #78909c;
  color: #2b343a;
  font-size: 15.5px;
  letter-spacing: 0.02em;
  line-height: 1.85;
  margin: 1.25em 0;
  padding: 14px 18px 14px 42px;
  text-align: left;
}
#crosspost-root li { line-height: 1.85; margin: 0.35em 0; padding-left: 2px; }
#crosspost-root blockquote {
  background: #f8fafb;
  border: 1px solid #dbe3e8;
  border-left: 4px solid #6d8795;
  color: #43535d;
  margin: 1.35em 0;
  padding: 12px 15px;
}
#crosspost-root blockquote p { margin: 0; text-indent: 0; }
#crosspost-root a { color: #315b71; text-decoration-color: #9aabb4; }
#crosspost-root strong { color: #17364a; font-weight: 700; }
#crosspost-root code {
  background: #f3f5f6;
  border: 1px solid #e1e5e8;
  border-radius: 3px;
  color: #8a3f31;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 0.88em;
  letter-spacing: 0;
  line-height: 1.5;
  padding: 0.12em 0.32em;
}
#crosspost-root pre {
  background: #f7f9fa;
  border: 1px solid #d4dde2;
  border-left: 4px solid #435f70;
  border-radius: 4px;
  color: #26343d;
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size: 12.5px;
  line-height: 1.68;
  margin: 1.5em 0;
  padding: 14px 13px 15px;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  font-size: inherit;
  padding: 0;
}
#crosspost-root p > img {
  background: #ffffff;
  border: 1px solid #e3e8eb;
  border-radius: 4px;
  box-shadow: 0 5px 18px rgba(25, 49, 63, 0.08);
  display: block;
  margin: 1.35em auto;
  width: 100%;
}
#crosspost-root table { color: #2b343a; font-size: 14.5px; margin: 1.4em 0; }
#crosspost-root th { background: #edf1f3; color: #17364a; font-weight: 700; }
#crosspost-root th, #crosspost-root td { border-color: #d4dde2; }
#crosspost-root hr { border: 0; border-top: 1px solid #d4dde2; margin: 2em 0; }
`,
  tech: `
${BASE_CSS}
#crosspost-root {
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
${headingCss("#0b5fff", "#f0f6ff", "#bcd3ff", "#1f3a5f")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f0f6ff;
  border: 1px solid #bcd3ff;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #f0f6ff;
  border-left: 4px solid #0b5fff;
  color: #1f3a5f;
  margin: 1em 0;
  padding: 0.75em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #0b5fff;
}
#crosspost-root code {
  background: #eef3f8;
  border-radius: 4px;
  color: #0b5fff;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.3em;
}
#crosspost-root pre {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #d0d7de;
  border-radius: 8px;
}
#crosspost-root table {
  font-size: 14.5px;
}
#crosspost-root th {
  background: #f0f6ff;
  color: #0b5fff;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #bcd3ff;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 2px solid #d0d7de;
  margin: 1.8em 0;
}
`,
  warm: `
${BASE_CSS}
#crosspost-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
${headingCss("#c2410c", "#fff7ed", "#fed7aa", "#9a3412")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #fff7ed;
  border-left: 4px solid #f97316;
  border-radius: 0 6px 6px 0;
  color: #7c2d12;
  margin: 1em 0;
  padding: 0.75em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #d97706;
  font-weight: 500;
}
#crosspost-root code {
  background: #fff7ed;
  border-radius: 4px;
  color: #9a3412;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.35em;
}
#crosspost-root pre {
  background: #1c1917;
  border-radius: 8px;
  color: #f59e0b;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #fed7aa;
  border-radius: 8px;
}
#crosspost-root th {
  background: #fff7ed;
  color: #9a3412;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #fed7aa;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 2px solid #fed7aa;
  margin: 1.8em 0;
}
`,
  bold: `
${BASE_CSS}
#crosspost-root {
  font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-weight: 450;
}
${headingCss("#111827", "#f3f4f6", "#d1d5db", "#6b7280")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f3f4f6;
  border: 2px solid #d1d5db;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  border-left: 6px solid #d1d5db;
  color: #374151;
  font-style: italic;
  margin: 1.2em 0;
  padding: 0.6em 1.2em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #1d4ed8;
  font-weight: 600;
}
#crosspost-root code {
  background: #111827;
  border-radius: 3px;
  color: #f9fafb;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 0.9em;
  padding: 0.12em 0.4em;
}
#crosspost-root pre {
  background: #111827;
  border-radius: 8px;
  color: #f9fafb;
  font-size: 0.92em;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  font-size: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 2px solid #111827;
  border-radius: 8px;
}
#crosspost-root table {
  font-size: 14.5px;
}
#crosspost-root th {
  background: #111827;
  color: #f9fafb;
  font-weight: 700;
  text-transform: uppercase;
}
#crosspost-root th, #crosspost-root td {
  border-color: #d1d5db;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 3px solid #111827;
  margin: 1.8em 0;
}
`,
  elegant: `
${BASE_CSS}
#crosspost-root {
  font-family: "Libre Baskerville", Georgia, "Noto Serif CJK SC", "Songti SC", serif;
  color: #2d2a26;
  line-height: 1.85;
}
${headingCss("#5a4e3c", "#faf7f2", "#e5dcd0", "#7c6e54")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #faf7f2;
  border: 1px solid #e5dcd0;
  border-radius: 4px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #faf7f2;
  border-left: 3px solid #c9b99a;
  color: #6b5f4f;
  font-style: italic;
  margin: 1.1em 0;
  padding: 0.5em 1.2em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #7c6e54;
  font-style: italic;
}
#crosspost-root code {
  background: #f5efe6;
  border: 1px solid #e5dcd0;
  border-radius: 3px;
  color: #7c6e54;
  font-family: "Source Code Pro", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  padding: 0.12em 0.4em;
}
#crosspost-root pre {
  background: #faf7f2;
  border: 1px solid #e5dcd0;
  border-radius: 8px;
  color: #3d382e;
  font-family: "Source Code Pro", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #e5dcd0;
  border-radius: 4px;
}
#crosspost-root th {
  background: #f5efe6;
  color: #5a4e3c;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #d6cfc3;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 1px solid #d6cfc3;
  margin: 2em 0;
}
`,
  fresh: `
${BASE_CSS}
#crosspost-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #064e3b;
}
${headingCss("#059669", "#ecfdf5", "#a7f3d0", "#047857")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-left: 4px solid #059669;
  border-radius: 0 8px 8px 0;
  color: #065f46;
  margin: 1em 0;
  padding: 0.75em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #059669;
  font-weight: 500;
}
#crosspost-root code {
  background: #ecfdf5;
  border-radius: 4px;
  color: #047857;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.35em;
}
#crosspost-root pre {
  background: #022c22;
  border-radius: 8px;
  color: #d1fae5;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #a7f3d0;
  border-radius: 8px;
}
#crosspost-root th {
  background: #ecfdf5;
  color: #047857;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #a7f3d0;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 2px solid #a7f3d0;
  margin: 1.8em 0;
}
`,
  dark: `
${BASE_CSS}
#crosspost-root {
  background: #0d1117;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #e6edf3;
}
${headingCss("#58a6ff", "#161b22", "#30363d", "#8b949e")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #161b22;
  border-left: 4px solid #3fb950;
  color: #8b949e;
  margin: 1em 0;
  padding: 0.5em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #58a6ff;
  font-weight: 500;
}
#crosspost-root code {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #ffa657;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.35em;
}
#crosspost-root pre {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #30363d;
  border-radius: 8px;
}
#crosspost-root table {
  font-size: 14.5px;
}
#crosspost-root th {
  background: #161b22;
  color: #f0f6fc;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #30363d;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 1px solid #30363d;
  margin: 1.8em 0;
}
`,
  zen: `
${BASE_CSS}
#crosspost-root {
  font-family: "Noto Serif CJK SC", "Songti SC", "Source Han Serif SC", Georgia, serif;
  color: #1f242e;
  font-size: 17px;
  line-height: 2;
}
${headingCss("#0b1940", "#f9fafb", "#e5e7eb", "#9ca3af")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  border-left: 2px solid #e5e7eb;
  color: #6b7280;
  font-style: italic;
  margin: 1.2em 0;
  padding: 0.2em 1.2em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #4b5563;
  font-style: italic;
  text-decoration-color: #d1d5db;
}
#crosspost-root code {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 3px;
  color: #6b7280;
  font-family: "Source Code Pro", "SFMono-Regular", Consolas, monospace;
  font-size: 0.88em;
  padding: 0.1em 0.35em;
}
#crosspost-root pre {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #374151;
  font-family: "Source Code Pro", "SFMono-Regular", Consolas, monospace;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
#crosspost-root th {
  background: #f9fafb;
  color: #374151;
  font-weight: 500;
}
#crosspost-root th, #crosspost-root td {
  border-color: #e5e7eb;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 1px solid #e5e7eb;
  margin: 2em 0;
}
`,
  ocean: `
${BASE_CSS}
#crosspost-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #0c4a6e;
}
${headingCss("#0284c7", "#f0f9ff", "#bae6fd", "#0369a1")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #f0f9ff;
  border-left: 4px solid #38bdf8;
  color: #0c4a6e;
  margin: 1em 0;
  padding: 0.75em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #0284c7;
  font-weight: 500;
  text-decoration-color: #7dd3fc;
}
#crosspost-root code {
  background: #f0f9ff;
  border-radius: 4px;
  color: #0369a1;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.35em;
}
#crosspost-root pre {
  background: #082f49;
  border-radius: 8px;
  color: #bae6fd;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #bae6fd;
  border-radius: 8px;
}
#crosspost-root th {
  background: #f0f9ff;
  color: #0369a1;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #bae6fd;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 2px solid #bae6fd;
  margin: 1.8em 0;
}
`,
  paper: `
${BASE_CSS}
#crosspost-root {
  background: #fffef9;
  font-family: "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #333;
  font-size: 16px;
  line-height: 1.8;
  padding: 1em;
}
${headingCss("#000000", "#f4f4ee", "#e0e0d8", "#555555")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f4f4ee;
  border: 1px solid #e0e0d8;
  border-radius: 2px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #f8f8f5;
  border-left: 3px solid #000;
  color: #555;
  font-style: italic;
  margin: 1em 0;
  padding: 0.6em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  box-shadow: inset 0 -2px 0 #ffd500;
  color: #000;
  text-decoration: none;
}
#crosspost-root code {
  background: #f4f4ee;
  border: 1px solid #e0e0d8;
  border-radius: 2px;
  color: #555;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 0.9em;
  padding: 0.1em 0.35em;
}
#crosspost-root pre {
  background: #f4f4ee;
  border: 1px solid #e0e0d8;
  color: #333;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  font-size: 0.9em;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: none;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #e0e0d8;
  border-radius: 2px;
}
#crosspost-root th {
  background: #000;
  color: #fff;
  font-weight: 700;
}
#crosspost-root th, #crosspost-root td {
  border-color: #ccc;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: none;
  border-top: 2px solid #000;
  margin: 1.5em 0;
}
`,
  cherry: `
${BASE_CSS}
#crosspost-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #4a1a2e;
}
${headingCss("#c2185b", "#fce4ec", "#f8bbd0", "#ad1457")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #fce4ec;
  border: 1px solid #f8bbd0;
  border-radius: 6px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #fce4ec;
  border-left: 4px solid #e91e63;
  border-radius: 0 8px 8px 0;
  color: #6a1b3a;
  margin: 1em 0;
  padding: 0.8em 1.1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #c2185b;
  font-weight: 500;
  text-decoration-color: #f48fb1;
}
#crosspost-root code {
  background: #fce4ec;
  border-radius: 4px;
  color: #ad1457;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.35em;
}
#crosspost-root pre {
  background: #3e0d1c;
  border-radius: 10px;
  color: #f8bbd0;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #f8bbd0;
  border-radius: 8px;
}
#crosspost-root th {
  background: #fce4ec;
  color: #880e4f;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #f8bbd0;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: 0;
  border-top: 2px solid #f8bbd0;
  margin: 1.8em 0;
}
`,
  forest: `
${BASE_CSS}
#crosspost-root {
  font-family: "Lora", Georgia, "Noto Serif CJK SC", "Songti SC", serif;
  color: #2d3a1f;
  line-height: 1.8;
}
${headingCss("#4a7c2e", "#f0f6e8", "#d5e8c4", "#3b5e1f")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f0f6e8;
  border: 1px solid #d5e8c4;
  border-radius: 4px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #f4f9ee;
  border: 1px solid #cfe2bc;
  border-left: 4px solid #6da34d;
  border-radius: 0 6px 6px 0;
  color: #3b521f;
  margin: 1em 0;
  padding: 0.8em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #4a7c2e;
  font-weight: 500;
  text-decoration-color: #a3c98a;
}
#crosspost-root code {
  background: #f0f6e8;
  border: 1px solid #d5e8c4;
  border-radius: 3px;
  color: #3b5e1f;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  padding: 0.12em 0.4em;
}
#crosspost-root pre {
  background: #1a2310;
  border-radius: 8px;
  color: #d5e8c4;
  font-family: "SFMono-Regular", Consolas, Menlo, monospace;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #d5e8c4;
  border-radius: 6px;
}
#crosspost-root th {
  background: #f0f6e8;
  color: #2d4a14;
  font-weight: 600;
}
#crosspost-root th, #crosspost-root td {
  border-color: #d5e8c4;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: none;
  border-top: 2px solid #cfe2bc;
  margin: 1.8em 0;
}
`,
  mono: `
${BASE_CSS}
#crosspost-root {
  font-family: "IBM Plex Mono", "Source Code Pro", "Cascadia Code", "Courier New", "PingFang SC", monospace;
  color: #111;
  font-size: 15px;
  line-height: 1.7;
}
${headingCss("#111111", "#f2f2f2", "#cccccc", "#444444")}
#crosspost-root h1, #crosspost-root h2, #crosspost-root h3 {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #f2f2f2;
  border: 1px solid #ccc;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  border: 1px solid #ccc;
  border-left: 8px solid #111;
  color: #444;
  margin: 1.1em 0;
  padding: 0.7em 1em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  border-bottom: 1px solid #111;
  color: #111;
  text-decoration: none;
}
#crosspost-root code {
  background: #111;
  color: #eee;
  font-size: 0.88em;
  padding: 0.1em 0.4em;
}
#crosspost-root pre {
  background: #111;
  border: 2px solid #111;
  color: #eee;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #999;
  border-radius: 0;
}
#crosspost-root table {
  border: 2px solid #111;
}
#crosspost-root th {
  background: #111;
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
#crosspost-root th, #crosspost-root td {
  border: 1px solid #666;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: none;
  border-top: 2px solid #111;
  margin: 1.8em 0;
}
`,
  vintage: `
${BASE_CSS}
#crosspost-root {
  background: #fdf6e3;
  font-family: "IM Fell English", "Noto Serif CJK SC", "Songti SC", Georgia, serif;
  color: #3e3232;
  font-size: 17px;
  line-height: 1.85;
  padding: 1em;
}
${headingCss("#5c3a21", "#faf3e0", "#e0caa2", "#8b6914")}
#crosspost-root p {
  margin: 0.8em 0;
}
#crosspost-root p[data-crosspost-formula-block="true"] {
  background: #faf3e0;
  border: 1px solid #e0caa2;
  border-radius: 3px;
  margin: 1.2em 0;
  padding: 1em;
}
#crosspost-root ul, #crosspost-root ol {
  margin: 0.8em 0;
  padding-left: 2em;
}
#crosspost-root li {
  margin: 0.35em 0;
}
#crosspost-root blockquote {
  background: #faf3e0;
  border: 1px solid #e0caa2;
  border-left: 4px solid #8b6914;
  color: #5c4a3a;
  font-style: italic;
  margin: 1.1em 0;
  padding: 0.7em 1.2em;
}
#crosspost-root blockquote p {
  margin: 0.3em 0;
}
#crosspost-root a {
  color: #8b6914;
  text-decoration-color: #c9a96e;
}
#crosspost-root code {
  background: #f5e9d3;
  border: 1px solid #e0caa2;
  border-radius: 3px;
  color: #5c3a21;
  font-family: "Source Code Pro", "SFMono-Regular", Consolas, monospace;
  font-size: 0.88em;
  padding: 0.1em 0.4em;
}
#crosspost-root pre {
  background: #3e3232;
  border: 1px solid #8b6914;
  border-radius: 4px;
  color: #f5e9d3;
  font-family: "Source Code Pro", "SFMono-Regular", Consolas, monospace;
  margin: 1.1em 0;
}
#crosspost-root pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
#crosspost-root p > img, #crosspost-root img:not([data-crosspost-formula]) {
  border: 1px solid #d4c4a8;
  border-radius: 3px;
}
#crosspost-root th {
  background: #5c3a21;
  color: #fdf6e3;
  font-weight: 500;
}
#crosspost-root th, #crosspost-root td {
  border-color: #d4c4a8;
  padding: 0.5em 0.7em;
}
#crosspost-root hr {
  border: none;
  border-top: 1px dotted #8b6914;
  margin: 1.8em 0;
}
`
};

const themeCache: Partial<Record<ThemeId, string>> = {};

export function getThemeCss(theme: ThemeId): string {
  const cached = themeCache[theme];
  if (cached === undefined) {
    const css = THEMES[theme];
    themeCache[theme] = css;
    return css;
  }
  return cached;
}

export const themeIds = Object.keys(THEMES) as ThemeId[];
