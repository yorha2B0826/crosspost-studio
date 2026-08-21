const ALLOWED_PROPERTIES = new Set([
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-color",
  "border-left",
  "border-radius",
  "border-style",
  "border-width",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "overflow",
  "overflow-wrap",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-indent",
  "vertical-align",
  "white-space",
  "width",
  "word-break"
]);

interface CssRule {
  body: string;
  selector: string;
}

function stripComments(css: string): string | undefined {
  let result = "";
  let quote = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index] ?? "";
    if (quote) {
      result += character;
      if (character === "\\") {
        index += 1;
        result += css[index] ?? "";
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += character;
      continue;
    }
    if (character === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      if (end < 0) {
        return undefined;
      }
      index = end + 1;
      continue;
    }
    result += character;
  }
  return quote ? undefined : result;
}

function findBoundary(
  value: string,
  start: number,
  boundaries: ReadonlySet<string>
): number {
  let quote = "";
  let parentheses = 0;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
    } else if (parentheses === 0 && boundaries.has(character)) {
      return index;
    }
  }
  return -1;
}

function readBlock(
  css: string,
  openBrace: number
): { body: string; nested: boolean; next: number } | undefined {
  let depth = 1;
  let nested = false;
  let quote = "";
  for (let index = openBrace + 1; index < css.length; index += 1) {
    const character = css[index] ?? "";
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
      nested = true;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: css.slice(openBrace + 1, index),
          nested,
          next: index + 1
        };
      }
    }
  }
  return undefined;
}

function parseRules(
  css: string,
  onWarning?: (warning: string) => void
): CssRule[] | undefined {
  const rules: CssRule[] = [];
  let index = 0;
  while (index < css.length) {
    while (/\s/.test(css[index] ?? "")) {
      index += 1;
    }
    if (index >= css.length) {
      break;
    }

    if (css[index] === "@") {
      const boundary = findBoundary(css, index, new Set([";", "{"]));
      if (boundary < 0) {
        return undefined;
      }
      if (css[boundary] === ";") {
        index = boundary + 1;
        continue;
      }
      const block = readBlock(css, boundary);
      if (!block) {
        return undefined;
      }
      index = block.next;
      continue;
    }

    const openBrace = findBoundary(css, index, new Set(["{", ";", "}"]));
    if (openBrace < 0) {
      return undefined;
    }
    if (css[openBrace] !== "{") {
      // Stray ";" or "}": drop only the broken fragment and resume parsing
      // at the next rule instead of discarding the whole stylesheet.
      onWarning?.(
        `Skipped malformed CSS fragment "${css.slice(index, openBrace + 1).trim().slice(0, 60)}".`
      );
      index = openBrace + 1;
      continue;
    }
    const selector = css.slice(index, openBrace).trim();
    const block = readBlock(css, openBrace);
    if (!block) {
      return undefined;
    }
    if (selector && !block.nested) {
      rules.push({ body: block.body, selector });
    }
    index = block.next;
  }
  return rules;
}

function splitDeclarations(body: string): string[] {
  const declarations: string[] = [];
  let start = 0;
  while (start <= body.length) {
    const boundary = findBoundary(body, start, new Set([";"]));
    if (boundary < 0) {
      declarations.push(body.slice(start));
      break;
    }
    declarations.push(body.slice(start, boundary));
    start = boundary + 1;
  }
  return declarations;
}

export function sanitizeCustomCss(
  css: string,
  onWarning?: (warning: string) => void
): string {
  const withoutComments = stripComments(css);
  if (withoutComments === undefined) {
    onWarning?.("Custom CSS was ignored because a comment or string is not terminated.");
    return "";
  }
  const rules = parseRules(withoutComments, onWarning);
  if (!rules) {
    onWarning?.("Custom CSS was ignored because it could not be parsed.");
    return "";
  }

  const output: string[] = [];
  for (const rule of rules) {
    const selectors = rule.selector.split(",").map((selector) => selector.trim());
    const scoped =
      selectors.length > 0 &&
      selectors.every((selector) => {
        const trimmed = selector.trim();
        const rootSelector = "#crosspost-root";
        return (
          !trimmed.includes("\\") &&
          (trimmed === rootSelector ||
            [" ", ">", "+", "~", ":", "[", ".", "#"].some((separator) =>
              trimmed.startsWith(`${rootSelector}${separator}`)
            ))
        );
      });
    if (!scoped) {
      continue;
    }

    const declarations: string[] = [];
    for (const declaration of splitDeclarations(rule.body)) {
      const separator = findBoundary(declaration, 0, new Set([":"]));
      if (separator < 0) {
        continue;
      }
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (
        !ALLOWED_PROPERTIES.has(property) ||
        !value ||
        /url\s*\(|image-set\s*\(|-webkit-image-set\s*\(|src\s*\(|expression\s*\(|javascript\s*:|[\\{}@]/i.test(value)
      ) {
        continue;
      }
      declarations.push(`${property}: ${value};`);
    }
    if (declarations.length > 0) {
      output.push(`${selectors.join(", ")} { ${declarations.join(" ")} }`);
    }
  }
  return output.join("\n");
}
