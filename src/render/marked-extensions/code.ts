/*
* marked extension for code
 - source code 
 - charts
 - mermaid
 - admonition

 credits to Sun BooShi, author of note-to-mp plugin
 */



import { Tokens } from "marked";
import { $t } from "src/lang/i18n";
import { replaceDivWithSection } from "src/utils/utils";
import { serializeNode } from "../../utils/dom";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { One2MpMarkedExtension } from "./extension";
import { Notice } from "obsidian";
import { MpcardDataManager } from "./mpcard-data";
import {
	normalizeMpcardInput,
	renderMpcardPreview,
} from "src/utils/mpcard-parser";
export class CodeRenderer extends One2MpMarkedExtension {
	showLineNumber: boolean;
	mermaidIndex: number = 0;
	admonitionIndex: number = 0;
	chartsIndex: number = 0;

	prepare(): Promise<void> {
		this.mermaidIndex = 0;
		this.admonitionIndex = 0;
		this.chartsIndex = 0;
		MpcardDataManager.getInstance().cleanup();
		return Promise.resolve();
	}

	static srcToBlob(src: string) {
		const base64 = src.split(',')[1];
		const byteCharacters = atob(base64);
		const byteNumbers = new Array(byteCharacters.length);
		for (let i = 0; i < byteCharacters.length; i++) {
			byteNumbers[i] = byteCharacters.charCodeAt(i);
		}
		const byteArray = new Uint8Array(byteNumbers);
		return new Blob([byteArray], { type: 'image/png' });
	}


	private getHighlightProfile(lang: string | undefined) {
		if (!lang) return null;
		const normalized = lang.toLowerCase();
		const jsKeywords = new Set([
			"const", "let", "var", "function", "return", "if", "else", "for", "while",
			"switch", "case", "break", "continue", "class", "new", "this", "try",
			"catch", "finally", "throw", "import", "export", "from", "extends", "super",
			"await", "async", "typeof", "instanceof", "in", "of", "interface", "type",
			"enum", "public", "private", "protected", "readonly", "implements",
			"constructor", "static", "get", "set"
		]);
		const pyKeywords = new Set([
			"def", "class", "import", "from", "return", "if", "elif", "else", "for",
			"while", "try", "except", "finally", "with", "as", "pass", "break",
			"continue", "lambda", "yield", "True", "False", "None"
		]);
		const jsonKeywords = new Set(["true", "false", "null"]);
		const shellKeywords = new Set([
			"if", "then", "fi", "for", "do", "done", "case", "esac", "function", "in",
			"while", "until", "return", "export", "local", "readonly"
		]);
		const profiles: Record<string, {
			keywords: Set<string>;
			lineComment?: string;
			blockComment?: { start: string; end: string };
			allowBacktick?: boolean;
		}> = {
			js: { keywords: jsKeywords, lineComment: "//", blockComment: { start: "/*", end: "*/" }, allowBacktick: true },
			javascript: { keywords: jsKeywords, lineComment: "//", blockComment: { start: "/*", end: "*/" }, allowBacktick: true },
			ts: { keywords: jsKeywords, lineComment: "//", blockComment: { start: "/*", end: "*/" }, allowBacktick: true },
			typescript: { keywords: jsKeywords, lineComment: "//", blockComment: { start: "/*", end: "*/" }, allowBacktick: true },
			json: { keywords: jsonKeywords },
			py: { keywords: pyKeywords, lineComment: "#" },
			python: { keywords: pyKeywords, lineComment: "#" },
			sh: { keywords: shellKeywords, lineComment: "#" },
			bash: { keywords: shellKeywords, lineComment: "#" },
			shell: { keywords: shellKeywords, lineComment: "#" },
			zsh: { keywords: shellKeywords, lineComment: "#" },
		};
		return profiles[normalized] || null;
	}

	private escapeHtml(text: string) {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	private preserveSpaces(text: string) {
		return text
			.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
			.replace(/ /g, "&nbsp;");
	}

	private isIdentifierStart(char: string) {
		const code = char.charCodeAt(0);
		return (
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			char === "_" ||
			char === "$"
		);
	}

	private isIdentifierPart(char: string) {
		const code = char.charCodeAt(0);
		return (
			(code >= 48 && code <= 57) ||
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			char === "_" ||
			char === "$"
		);
	}

	private highlightLine(
		line: string,
		state: { inBlockComment: boolean; inString: boolean; stringChar: string },
		profile: NonNullable<ReturnType<CodeRenderer["getHighlightProfile"]>>
	) {
		const tokens: Array<{ type: string; text: string }> = [];
		let i = 0;
		const pushToken = (type: string, text: string) => {
			if (!text) return;
			tokens.push({ type, text });
		};
		while (i < line.length) {
			const current = line[i];

			if (state.inBlockComment && profile.blockComment) {
				const end = line.indexOf(profile.blockComment.end, i);
				if (end >= 0) {
					pushToken("comment", line.slice(i, end + profile.blockComment.end.length));
					i = end + profile.blockComment.end.length;
					state.inBlockComment = false;
					continue;
				}
				pushToken("comment", line.slice(i));
				i = line.length;
				continue;
			}

			if (state.inString) {
				let text = "";
				while (i < line.length) {
					const ch = line[i];
					text += ch;
					if (ch === "\\" && i + 1 < line.length) {
						text += line[i + 1];
						i += 2;
						continue;
					}
					i += 1;
					if (ch === state.stringChar) {
						state.inString = false;
						break;
					}
				}
				pushToken("string", text);
				continue;
			}

			if (profile.lineComment && line.startsWith(profile.lineComment, i)) {
				pushToken("comment", line.slice(i));
				break;
			}

			if (profile.blockComment && line.startsWith(profile.blockComment.start, i)) {
				state.inBlockComment = true;
				continue;
			}

			if (current === "'" || current === '"' || (current === "`" && profile.allowBacktick)) {
				state.inString = true;
				state.stringChar = current;
				continue;
			}

			if (current === " " || current === "\t") {
				let start = i;
				while (i < line.length && (line[i] === " " || line[i] === "\t")) i += 1;
				pushToken("plain", line.slice(start, i));
				continue;
			}

			const code = current.charCodeAt(0);
			if ((code >= 48 && code <= 57) || (current === "." && i + 1 < line.length && line[i + 1] >= "0" && line[i + 1] <= "9")) {
				let start = i;
				i += 1;
				while (i < line.length) {
					const c = line[i];
					if ((c >= "0" && c <= "9") || c === "." || c === "_" || c === "x" || c === "X" || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) {
						i += 1;
						continue;
					}
					break;
				}
				pushToken("number", line.slice(start, i));
				continue;
			}

			if (this.isIdentifierStart(current)) {
				let start = i;
				i += 1;
				while (i < line.length && this.isIdentifierPart(line[i])) i += 1;
				const word = line.slice(start, i);
				if (profile.keywords.has(word)) {
					pushToken("keyword", word);
				} else {
					pushToken("plain", word);
				}
				continue;
			}

			pushToken("plain", current);
			i += 1;
		}

		const html = tokens
			.map((token) => {
				const escaped = this.preserveSpaces(this.escapeHtml(token.text));
				if (token.type === "plain") return escaped;
				return `<span class="o2any-token-${token.type}">${escaped}</span>`;
			})
			.join("");
		return { html, state };
	}

	codeRenderer(code: string, infostring: string | undefined): string {
		const lang = (infostring || "").match(/^\S*/)?.[0];
		const trimmed = code.replace(/\n$/, "");
		const profile = this.getHighlightProfile(lang || "");
		const lines = trimmed.split(/\r?\n/);
		let body = '';
		const state = { inBlockComment: false, inString: false, stringChar: "" };
		for (const line of lines) {
			let text = line;
			if (profile) {
				const result = this.highlightLine(line, state, profile);
				text = result.html;
				state.inBlockComment = result.state.inBlockComment;
				state.inString = result.state.inString;
				state.stringChar = result.state.stringChar;
			} else {
				text = this.preserveSpaces(this.escapeHtml(line));
			}
			if (text.length === 0) text = '<br>';
			body += '<code>' + text + '</code>';
		}

		let codeSection = '<section class="code-section code-snippet__fix">';
		let html = '';
		if (lang) {
			html = codeSection + `<pre style="max-width:1000% !important;" class="hljs o2any-codeblock language-${lang}">${body}</pre></section>`;
		} else {
			html = codeSection + `<pre class="hljs o2any-codeblock">${body}</pre></section>`;
		}
		return html;

	}

	static getMathType(lang: string | null) {
		if (!lang) return null;
		let l = lang.toLowerCase();
		l = l.trim();
		if (l === 'am' || l === 'asciimath') return 'asciimath';
		if (l === 'latex' || l === 'tex') return 'latex';
		return null;
	}

	renderAdmonition(_token: Tokens.Generic, _type: string) {
		let root = ObsidianMarkdownRenderer.getInstance(this.plugin.app).queryElement(this.admonitionIndex, '.callout.admonition')
		if (!root) {
			return $t('render.admonition-failed');
		}
		this.admonitionIndex++

		const editDiv = root.querySelector('.edit-block-button');
		if (editDiv) {
			editDiv.parentNode!.removeChild(editDiv);
		}
		const foldDiv = root.querySelector('.callout-fold');
		if (foldDiv) {

			try {
				foldDiv.parentNode!.removeChild(foldDiv);
			} catch (e) {
				console.error(e)
			}

		}
		return serializeNode(root)
	}
	renderAdmonitionAsync(_token: Tokens.Generic, _type: string) {
		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app);
		let root = renderer.queryElement(this.admonitionIndex, '.callout.admonition')
		if (!root) {
			return $t('render.admonition-failed');
		}
		this.admonitionIndex++

		const editDiv = root.querySelector('.edit-block-button');
		if (editDiv) {
			editDiv.parentNode!.removeChild(editDiv);
		}
		const foldDiv = root.querySelector('.callout-fold');
		if (foldDiv) {

			try {
				foldDiv.parentNode!.removeChild(foldDiv);
			} catch (e) {
				console.error(e)
			}

		}
		return replaceDivWithSection(root)//serializeNode(root)
	}

	async renderMermaidAsync(token: Tokens.Generic) {
		// define default failed
		token.html = $t('render.mermaid-failed');

		// const href = token.href;
		const index = this.mermaidIndex;
		this.mermaidIndex++;

		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app);

		const root = renderer.queryElement(index, '.mermaid')
		if (!root) {
			return
		}

		await renderer.waitForSelector(root, "svg", 5000);
		const svg = root.querySelector<SVGElement>("svg");
		if (!svg) {
			return;
		}

		const previewer = root.closest<HTMLElement>(".one2mp-render-preview");
		const previewerHadClass =
			previewer?.classList.contains("one2mp-render-preview-visible") ?? false;
		const rootHadClass = root.classList.contains("one2mp-mermaid-visible");

		try {
			previewer?.classList.add("one2mp-render-preview-visible");
			root.classList.add("one2mp-mermaid-visible");

			const { width, height } = this.getMermaidSize(svg);
			const dataUrl = await renderer.domToImage(svg, {
				width,
				height,
			});

			token.html = `<section id="one2mp-mermaid-${index}" class="mermaid"><img src="${dataUrl}" class="mermaid-image" style="width:${width}px;height:auto;"></section>`;
		} catch (error) {
			console.error(error);
		} finally {
			if (previewer && !previewerHadClass) {
				previewer.classList.remove("one2mp-render-preview-visible");
			}
			if (!rootHadClass) {
				root.classList.remove("one2mp-mermaid-visible");
			}
		}
	}

	private getMermaidSize(svg: SVGElement) {
		const rect = svg.getBoundingClientRect();
		let width = Math.round(rect.width);
		let height = Math.round(rect.height);
		if (!width || !height) {
			const viewBox = (svg as SVGSVGElement).viewBox?.baseVal;
			if (viewBox && viewBox.width && viewBox.height) {
				width = Math.round(viewBox.width);
				height = Math.round(viewBox.height);
			}
		}
		if (!width || !height) {
			const attrWidth = svg.getAttribute("width");
			const attrHeight = svg.getAttribute("height");
			const parsedWidth = attrWidth ? parseFloat(attrWidth) : 0;
			const parsedHeight = attrHeight ? parseFloat(attrHeight) : 0;
			if (parsedWidth) width = Math.round(parsedWidth);
			if (parsedHeight) height = Math.round(parsedHeight);
		}
		if (!width) width = 800;
		if (!height) height = 400;
		return { width, height };
	}

	renderCharts(_token: Tokens.Generic) {
		//the MarkdownRender doen't work well with it. use the preview instead.
		if (!this.isPluginInstlled('obsidian-charts')) {
			console.debug(`charts plugin not installed.`);
			new Notice($t('rnder.charts-plugin-not-installed'))
			return false;
		}
		const root = this.plugin.resourceManager.getMarkdownRenderedElement(this.chartsIndex, '.block-language-chart')

		if (!root) {
			return $t('render.charts-failed');
		}
		const containerId = `charts-img-${this.chartsIndex}`;
		this.chartsIndex++;
		const canvas = root.querySelector('canvas')
		if (canvas) {
			const MIME_TYPE = "image/png";
			const imgURL = canvas.toDataURL(MIME_TYPE);
			return `<section id="${containerId}" class="charts" >
			<img src="${imgURL}" class="charts-image" />
			</section>`;
		}
		return $t('render.charts-failed');
	}
	renderWewriteProfile(token: Tokens.Generic) {
		// 按行分割并过滤空行
		const lines = token.text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
		const result: Record<string, string> = {};

		const keyValueRegex = /^(\w+):\s*"?(.*?)"?$/; // 匹配键值对

		lines.forEach((line: string) => {
			const match = line.match(keyValueRegex);
			if (match) {
				const key = match[1].trim().toLocaleLowerCase();
				const value = match[2].trim();
				result[key] = value;
			}
		});

		const html = `<div class="one2mp-profile-card">
		<a class="one2mp-profile-card-link" href="${result.url}">
			<div class="card-main">
				<div class="avatar">
					<img src="${result.avatar}" alt="${result.nickname}" avatar class="one2mp-avatar-image" >
				</div>
			<div class="content">
				<div class="title">${result.nickname}</div>
				<div class="description">${result.description}</div>
				<div class="meta">${result.tips}</div>
			</div>
			<div class="arrow"><i class="weui-icon-arrow"></i></div>
			</div>
			<div class="card-footer">${result.footer}</div>
		</a>
  	</div>`
		return html;
	}
	private renderMpcard(token: Tokens.Generic) {
		const normalized = normalizeMpcardInput(token.text);
		if (!normalized) {
			return "<span>公众号名片数据错误，缺少id</span>";
		}
		const { info, html } = normalized;
		if (!info.headimg && !info.nickname && !info.signature) {
			return "<span>公众号名片数据为空</span>";
		}
		MpcardDataManager.getInstance().setCardData(info.id, html);
		return renderMpcardPreview({
			...info,
			nickname: info.nickname || $t("render.mpcard-default-name"),
			signature: info.signature || $t("render.mpcard-default-signature"),
		});
	}
	markedExtension() {
		return {
			extensions: [{
				name: 'code',
				level: 'block',
				renderer: (token: Tokens.Generic) => {
					if (token.lang && token.lang.trim().toLocaleLowerCase() == 'mermaid') {
						return token.html
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase() == 'chart') {
						return this.renderCharts(token);
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase() == 'one2mp-profile') {
						return this.renderWewriteProfile(token);
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase() == 'mpcard') {
						return this.renderMpcard(token);
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase().startsWith('ad-')) {
						return token.html
					}
					return this.codeRenderer(token.text, token.lang);
				},
			}
			],
			async: true,
			walkTokens: async (token: Tokens.Generic) => {
				if (token.lang && token.lang.trim().toLocaleLowerCase() == 'mermaid') {
					await this.renderMermaidAsync(token);
				}
				if (token.lang && token.lang.trim().toLocaleLowerCase().startsWith('ad-')) {
					//admonition
					let type = token.lang.trim().toLocaleLowerCase().replace('ad-', '');
					if (type === '') type = 'note';

					token.html = this.renderAdmonitionAsync(token, type);
				}

			}
		}
	}
}
