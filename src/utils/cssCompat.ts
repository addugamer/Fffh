function findMatchingBrace(css: string, openBraceIdx: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openBraceIdx; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];

    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      const endComment = css.indexOf('*/', i + 2);
      if (endComment === -1) return css.length - 1;
      i = endComment + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

export function unwrapCssLayers(css: string): string {
  // Remove standalone `@layer theme, base, components, utilities;` statements
  let output = css.replace(/@layer\s+[^{};]+;/g, '');

  let searchFrom = 0;
  while (true) {
    const idx = output.indexOf('@layer', searchFrom);
    if (idx === -1) break;

    // Ensure token boundary after @layer
    const afterKeyword = output[idx + 6];
    if (afterKeyword && !/[\s{]/.test(afterKeyword)) {
      searchFrom = idx + 6;
      continue;
    }

    const openBrace = output.indexOf('{', idx + 6);
    const semi = output.indexOf(';', idx + 6);
    if (semi !== -1 && (openBrace === -1 || semi < openBrace)) {
      output = output.slice(0, idx) + output.slice(semi + 1);
      searchFrom = idx;
      continue;
    }

    if (openBrace === -1) break;

    const closeBrace = findMatchingBrace(output, openBrace);
    if (closeBrace === -1) break;

    const inner = output.slice(openBrace + 1, closeBrace);
    output = output.slice(0, idx) + inner + output.slice(closeBrace + 1);
    searchFrom = idx;
  }

  return output;
}

export function unwrapPropertiesFallbackSupports(css: string): string {
  let output = css;
  let searchFrom = 0;
  while (true) {
    const idx = output.indexOf('@supports', searchFrom);
    if (idx === -1) break;

    const openBrace = output.indexOf('{', idx + 9);
    if (openBrace === -1) break;

    const closeBrace = findMatchingBrace(output, openBrace);
    if (closeBrace === -1) break;

    const condition = output.slice(idx + 9, openBrace);
    const inner = output.slice(openBrace + 1, closeBrace);

    if (
      condition.includes('-webkit-hyphens') &&
      (inner.includes('--tw-translate-x') || inner.includes('--tw-border-style'))
    ) {
      output = output.slice(0, idx) + inner + output.slice(closeBrace + 1);
      searchFrom = idx;
    } else {
      searchFrom = openBrace + 1;
    }
  }
  return output;
}

function linearToSrgbByte(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  const gamma =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, gamma * 255)));
}

export function oklchStringToRgb(
  lRaw: string,
  cRaw: string,
  hRaw: string,
  alphaRaw?: string,
): string {
  const l = lRaw.endsWith('%') ? parseFloat(lRaw) / 100 : parseFloat(lRaw);
  const c = cRaw.endsWith('%') ? (parseFloat(cRaw) / 100) * 0.4 : parseFloat(cRaw);
  const hDeg = hRaw === 'none' ? 0 : parseFloat(hRaw);
  const hRad = (hDeg * Math.PI) / 180;

  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const r = linearToSrgbByte(rLin);
  const g = linearToSrgbByte(gLin);
  const bl = linearToSrgbByte(bLin);

  if (alphaRaw !== undefined && alphaRaw.trim() !== '') {
    const trimmed = alphaRaw.trim();
    const alpha = trimmed.endsWith('%') ? parseFloat(trimmed) / 100 : parseFloat(trimmed);
    const roundedAlpha = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;
    if (roundedAlpha < 1) {
      return `rgba(${r},${g},${bl},${roundedAlpha})`;
    }
  }

  return `rgb(${r},${g},${bl})`;
}

export function convertOklchToRgb(css: string): string {
  return css.replace(
    /oklch\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+?)(?:deg)?\s*(?:\/\s*([^)]+?))?\s*\)/gi,
    (_full, l: string, c: string, h: string, alpha?: string) =>
      oklchStringToRgb(l, c, h, alpha),
  );
}

export function makeCssLegacyCompatible(css: string): string {
  return convertOklchToRgb(unwrapPropertiesFallbackSupports(unwrapCssLayers(css)));
}
