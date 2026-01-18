/**
 * This is the customized render for WeChat
 *
 * it is based on marked and its extension mechanism
 *
 * this file the framework and entry point for the renderer
 *
 * each functionality will be implemented in different extensions of marked.
 *
 */

import { Marked, Tokens, Renderer } from "marked";
import { sanitizeHTMLToDom } from "obsidian";
import One2MpPlugin from "src/main";
import { WechatClient } from "../wechat-api/wechat-client";
import { BlockquoteRenderer } from "./marked-extensions/blockquote";
import { CodeRenderer } from "./marked-extensions/code";
import { CodespanRenderer } from "./marked-extensions/codespan";
import { Embed } from "./marked-extensions/embed";
import {
	PreviewRender,
	One2MpMarkedExtension,
} from "./marked-extensions/extension";
import { Heading } from "./marked-extensions/heading";
import { MathRenderer } from "./marked-extensions/math";
import { RemixIconRenderer } from "./marked-extensions/remix-icon";
import { Table } from "./marked-extensions/table";
import { Footnote } from "./marked-extensions/footnote";
import { Links } from "./marked-extensions/links";
import { Summary } from "./marked-extensions/summary";
import { Image } from "./marked-extensions/image";
import { stripTemplateMarkerLines } from "src/utils/template-markers";
import { parseFrontmatter } from "src/utils/frontmatter";
// import { ListItem } from './marked-extensions/list-item'

const markedOptiones = {
	gfm: true,
	breaks: true,
};

const normalizeHrAfterImage = (content: string) => {
	const lines = content.split(/\r?\n/);
	const isHrLine = (line: string) => /^[\t ]*([-*_])\1\1+[\t ]*$/.test(line);
	const isImageLine = (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) {
			return false;
		}
		if (/^!\[\[.+\]\]$/.test(trimmed)) {
			return true;
		}
		return /^!\[[^\]]*]\([^)]+\)$/.test(trimmed);
	};
	const result: string[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (isHrLine(line) && i > 0 && isImageLine(lines[i - 1])) {
			if (result.length && result[result.length - 1].trim() !== "") {
				result.push("");
			}
		}
		result.push(line);
	}
	return result.join("\n");
};

export class WechatRender {
	plugin: One2MpPlugin;
	client: WechatClient;
	extensions: One2MpMarkedExtension[] = [];
	private static instance: WechatRender | null = null;
	marked: Marked;
	previewRender: PreviewRender;
	delayParse = (path: string): Promise<string> => {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				this.plugin.app.vault.adapter
					.read(path)
					.then((md) => this.parse(md))
					.then((html) => this.postprocess(html))
					.then(resolve)
					.catch((error: unknown) => {
						const err =
							error instanceof Error ? error : new Error(String(error));
						reject(err);
					});
			}, 100);
		});
	};
	private constructor(plugin: One2MpPlugin, previewRender: PreviewRender) {
		this.plugin = plugin;
		this.previewRender = previewRender;
		this.client = WechatClient.getInstance(plugin);
		this.marked = new Marked();
		this.marked.use(markedOptiones);
		this.marked.use({
			renderer: {
				list(this: Renderer, token: Tokens.List) {
					let body = '';
					if (token.items) {
						for (const item of token.items) {
							body += this.listitem(item);
						}
					}
					const type = token.ordered ? 'ol' : 'ul';
					const startatt =
						token.ordered && token.start !== 1
							? ' start="' + token.start + '"'
							: '';
					return (
						'<' +
						type +
						startatt +
						' class="list-paddingleft-1">' +
						body +
						'</' +
						type +
						'>'
					);
				},
				listitem(this: Renderer, token: Tokens.ListItem) {
					const body = token.tokens
						? this.parser.parse(token.tokens)
						: token.text || '';
					return `<li><section>${body}</section></li>`;
				},
			},
		});
		this.useExtensions();
	}
	static getInstance(plugin: One2MpPlugin, previewRender: PreviewRender) {
		if (!WechatRender.instance) {
			WechatRender.instance = new WechatRender(plugin, previewRender);
		}
		return WechatRender.instance;
	}
	static resetInstance() {
		WechatRender.instance = null;
	}
	addExtension(extension: One2MpMarkedExtension) {
		this.extensions.push(extension);
		this.marked.use(extension.markedExtension());
	}
	useExtensions() {
		// 所有 Markdown 扩展集中在这里注册，统一走 marked 渲染
		this.addExtension(
			new Footnote(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Heading(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Embed(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new CodeRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new CodespanRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new MathRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new RemixIconRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new BlockquoteRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Table(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Links(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Summary(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Image(this.plugin, this.previewRender, this.marked)
		);
		// this.addExtension(new ListItem(this.plugin, this.previewRender, this.marked))
	}
	async parse(md: string) {
		const { content } = parseFrontmatter(md);
		const cleaned = stripTemplateMarkerLines(content);
		const normalized = normalizeHrAfterImage(cleaned);
		// 先让扩展完成预处理（如缓存、索引）
		for (const extension of this.extensions) {
			await extension.prepare();
		}
		return await this.marked.parse(normalized);
	}
	async postprocess(html: string) {
		let result = html;
		// 后处理阶段用于清理/修正 HTML
		for (let ext of this.extensions) {
			result = await ext.postprocess(result);
		}
		result = this.removeEmptyListItems(result);
		return result;
	}

	private removeEmptyListItems(html: string) {
		// WeChat 编辑器会保留空的 <li>，导致空序号，这里统一清理掉仅含换行/空白的条目。
		const wrapper = document.createElement('div');
		wrapper.appendChild(sanitizeHTMLToDom(html));
		wrapper.querySelectorAll('ol li, ul li').forEach((li) => {
			const hasMedia = li.querySelector('img, video, figure');
			// 彻底清理空白字符、<br> 和空标签
			const content = li.innerHTML
				.replace(/<br\s*\/?>/gi, '')
				.replace(/&nbsp;/gi, '')
				.replace(/\u00A0/g, '')
				.replace(/<span[^>]*>\s*<\/span>/gi, '')
				.replace(/<section[^>]*>\s*<\/section>/gi, '')
				.replace(/<div[^>]*>\s*<\/div>/gi, '')
				.replace(/[\s\u200B-\u200D]+/g, '')
				.trim();
			if (!hasMedia && content === '') {
				li.remove();
			}
		});
		return wrapper.innerHTML;
	}

	public async parseNote(path: string) {
		// 直接读取 Markdown 并走 marked 解析，减少双重渲染的开销
		const md = await this.plugin.app.vault.adapter.read(path);
		// 每次解析前重置扩展内部状态（links、mermaid 索引等）
		let html = await this.parse(md);
		html = await this.postprocess(html);
		return html;
	}
}
