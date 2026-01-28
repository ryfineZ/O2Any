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
import { serializeChildren } from "../utils/dom";
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
import { getWechatArticleUrlFromFrontmatter } from "src/utils/wechat-frontmatter";
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
	private async replaceInternalLinks(content: string, notePath: string): Promise<string> {
		const frontmatterCache = new Map<string, Record<string, unknown> | null>();
		const escapeHtml = (value: string) =>
			value
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#39;");
		const resolveFrontmatter = async (filePath: string) => {
			if (frontmatterCache.has(filePath)) {
				return frontmatterCache.get(filePath) ?? null;
			}
			try {
				const raw = await this.plugin.app.vault.adapter.read(filePath);
				const { data } = parseFrontmatter(raw);
				frontmatterCache.set(filePath, data ?? null);
				return data ?? null;
			} catch {
				frontmatterCache.set(filePath, null);
				return null;
			}
		};
		const resolveWikiToken = async (token: string) => {
			const inner = token.slice(2, -2);
			const [linkPartRaw, aliasRaw] = inner.split('|', 2);
			const linkPart = (linkPartRaw ?? '').trim();
			const display = (aliasRaw ?? linkPart).trim();
			const linkPath = linkPart.split('#')[0].trim();
			if (!linkPath) {
				return display || token;
			}
			const file = this.plugin.app.metadataCache.getFirstLinkpathDest(linkPath, notePath);
			if (!file) {
				return display || linkPath;
			}
			let frontmatter = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
			if (!frontmatter) {
				frontmatter = await resolveFrontmatter(file.path);
			}
			const url = getWechatArticleUrlFromFrontmatter(frontmatter);
			const label = display || file.basename || linkPath;
			if (!url) {
				return label;
			}
			const safeUrl = escapeHtml(url);
			const safeLabel = escapeHtml(label);
			return `<a data-linktype=\"2\" data-link=\"${safeUrl}\" href=\"${safeUrl}\">${safeLabel}</a>`;
		};
		const lines = content.split(/\r?\n/);
		let inFence = false;
		const output: string[] = [];
		for (const line of lines) {
			if (/^\s*```/.test(line)) {
				inFence = !inFence;
				output.push(line);
				continue;
			}
			if (inFence) {
				output.push(line);
				continue;
			}
			const pattern = /!\[\[[^\]]+\]\]|\[\[[^\]]+\]\]/g;
			let lastIndex = 0;
			let result = '';
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(line)) !== null) {
				const token = match[0];
				result += line.slice(lastIndex, match.index);
				if (token.startsWith('![[')) {
					result += token;
				} else {
					result += await resolveWikiToken(token);
				}
				lastIndex = match.index + token.length;
			}
			result += line.slice(lastIndex);
			output.push(result);
		}
		return output.join('\n');
	}

	async parse(md: string, notePath?: string) {
		const { content } = parseFrontmatter(md);
		const cleaned = stripTemplateMarkerLines(content);
		const normalized = normalizeHrAfterImage(cleaned);
		const processed = notePath
			? await this.replaceInternalLinks(normalized, notePath)
			: normalized;
		// 先让扩展完成预处理（如缓存、索引）
		for (const extension of this.extensions) {
			await extension.prepare();
		}
		return await this.marked.parse(processed);
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
			const content = serializeChildren(li)
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
		return serializeChildren(wrapper);
	}

	public async parseNote(path: string) {
		// 直接读取 Markdown 并走 marked 解析，减少双重渲染的开销
		const md = await this.plugin.app.vault.adapter.read(path);
		// 每次解析前重置扩展内部状态（links、mermaid 索引等）
		let html = await this.parse(md, path);
		html = await this.postprocess(html);
		return html;
	}
}
