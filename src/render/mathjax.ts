/**
 * 使用 Obsidian 内置 MathJax（全局对象）渲染公式为 SVG
 */

type MathJaxGlobal = {
  tex2svg?: (tex: string, options?: { display?: boolean }) => Element;
};

const serializer = new XMLSerializer();

function getMathJax(): MathJaxGlobal | null {
  const mj = (globalThis as typeof globalThis & { MathJax?: MathJaxGlobal }).MathJax;
  return mj ?? null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeSvg(node: Element): string {
  const svg = node.tagName.toLowerCase() == "svg" ? node : node.querySelector("svg");
  if (!svg) {
    return escapeHtml(node.textContent ?? "");
  }
  return serializer.serializeToString(svg);
}

export function parseMath(math: string, display: boolean = false): string {
  const mj = getMathJax();
  if (!mj?.tex2svg) {
    return escapeHtml(math);
  }
  try {
    const node = mj.tex2svg(math, { display });
    return serializeSvg(node);
  } catch (error) {
    console.warn("MathJax 渲染失败", error);
    return escapeHtml(math);
  }
}
