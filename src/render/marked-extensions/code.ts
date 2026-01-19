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

	codeRenderer(code: string, infostring: string | undefined): string {
		const lang = (infostring || "").match(/^\S*/)?.[0];
		const trimmed = code.replace(/\n$/, "");
		const escapeHtml = (text: string) =>
			text
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#39;");
		const normalized = escapeHtml(trimmed)
			.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
			.replace(/ /g, "&nbsp;");
		const lines = normalized.split(/\r?\n/);
		let body = '';
		for (let i = 0; i < lines.length; i++) {
			let text = lines[i];
			if (text.length === 0) text = '<br>';
			body += '<code>' + text + '</code>';
		}

		let codeSection = '<section class="code-section code-snippet__fix">';
		let html = '';
		if (lang) {
			html = codeSection + `<pre style="max-width:1000% !important;" class="hljs language-${lang}">${body}</pre></section>`;
		} else {
			html = codeSection + `<pre class="hljs">${body}</pre></section>`;
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
		return root.outerHTML
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
		return replaceDivWithSection(root)//root.outerHTML
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
