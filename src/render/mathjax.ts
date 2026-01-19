/**
 * MathJax 包装：使用 Obsidian 内置 MathJax 输出 SVG
 */

type MathJaxGlobal = {
  tex2svg?: (math: string, options?: { display?: boolean }) => Element;
  tex2svgPromise?: (math: string, options?: { display?: boolean }) => Promise<Element>;
};

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function getMathJax(): MathJaxGlobal | null {
  const mj = (globalThis as unknown as { MathJax?: MathJaxGlobal }).MathJax;
  return mj ?? null;
}

export function parseMath(math: string, display = false): string {
  const mj = getMathJax();
  if (mj?.tex2svg) {
    const node = mj.tex2svg(math, { display });
    const svg = (node as Element).querySelector("svg") ?? node;
    return new XMLSerializer().serializeToString(svg);
  }
  return escapeHtml(math);
}

const inlineRule = /\$(.*)\$/g;
const blockRule = /\$\$(?!<\$\$)([\s\S]*?)\$\$/g;

export function parseHTML(html: string): string {
  let matches = html.match(blockRule);
  if (matches) {
    matches.forEach((match) => {
      const math = match.replace(/\$/g, "");
      const svg = parseMath(math, true);
      html = html.replace(match, svg);
    });
  }

  matches = html.match(inlineRule);
  if (matches) {
    matches.forEach((match) => {
      const math = match.replace(/\$/g, "");
      const svg = parseMath(math, false);
      html = html.replace(match, svg);
    });
  }
  return html;
}
