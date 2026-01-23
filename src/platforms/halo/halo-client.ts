import { Notice, TFile, requestUrl } from "obsidian";
import { Marked } from "marked";
import type One2MpPlugin from "src/main";
import type { HaloSiteInfo } from "src/settings/one2mp-setting";
import { getCoverFromFrontmatter } from "src/utils/wechat-frontmatter";
import { $t } from "src/lang/i18n";

export type HaloPost = {
	apiVersion: string;
	kind: string;
	metadata: {
		name: string;
		annotations?: Record<string, string>;
	};
	spec: {
		allowComment: boolean;
		categories: string[];
		cover: string;
		deleted: boolean;
		excerpt: { autoGenerate: boolean; raw: string };
		headSnapshot: string;
		htmlMetas: unknown[];
		owner: string;
		pinned: boolean;
		priority: number;
		publish: boolean;
		publishTime: string;
		releaseSnapshot: string;
		slug: string;
		tags: string[];
		template: string;
		title: string;
		visible: string;
		baseSnapshot?: string;
	};
	status?: {
		permalink?: string | null;
	};
};

type HaloContent = {
	rawType: string;
	raw: string;
	content: string;
};

type HaloSnapshot = {
	metadata: { annotations?: Record<string, string> };
	spec?: { rawType?: string };
};

type HaloCategory = {
	metadata: { name: string };
	spec: { displayName: string };
};

type HaloTag = {
	metadata: { name: string };
	spec: { displayName: string };
};

export class HaloClient {
	private readonly plugin: One2MpPlugin;
	private linkCache = new Map<string, string>();
	private imageCache = new Map<string, string>();
	private uploadPermissionNotified = false;
	private uploadConfigNotified = false;

	constructor(plugin: One2MpPlugin) {
		this.plugin = plugin;
	}

	async publishActiveNote(): Promise<void> {
		const site = this.getSelectedSite();
		if (!site) {
			new Notice($t("views.halo.missing-site"));
			return;
		}
		if (!site.url.trim() || !site.token.trim()) {
			new Notice($t("views.halo.missing-site"));
			return;
		}
		const file = this.getActiveMarkdownFile();
		if (!file) {
			new Notice($t("views.halo.no-active-file"));
			return;
		}
		this.linkCache.clear();
		this.imageCache.clear();
		new Notice($t("views.halo.publishing"));
		try {
			await this.publishFile(file, site);
			new Notice($t("views.halo.publish-success"));
		} catch (error) {
			console.error("Halo 发布失败", error);
			new Notice($t("views.halo.publish-failed"));
		}
	}

	private getActiveMarkdownFile(): TFile | null {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			return null;
		}
		return file;
	}

	private getSelectedSite(): HaloSiteInfo | null {
		const { haloSites, selectedHaloSite } = this.plugin.settings;
		if (!haloSites || haloSites.length === 0) {
			return null;
		}
		if (selectedHaloSite) {
			const hit = haloSites.find((site) => site.name === selectedHaloSite);
			if (hit) {
				return hit;
			}
		}
		return haloSites[0] ?? null;
	}

	async testConnection(site: HaloSiteInfo): Promise<{ ok: boolean; code?: string; status?: number }> {
		const url = `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts?page=0&size=1`;
		try {
			const response = await requestUrl({
				url,
				method: "GET",
				headers: this.buildHeaders(site),
				throw: false,
			});
			if (response.status >= 200 && response.status < 300) {
				return { ok: true };
			}
			if (response.status === 401 || response.status === 403) {
				return { ok: false, code: "auth", status: response.status };
			}
			if (response.status === 404) {
				return { ok: false, code: "not-found", status: response.status };
			}
			return { ok: false, code: "unknown", status: response.status };
		} catch (error) {
			console.warn("Halo 连接测试失败", error);
			return { ok: false, code: "network" };
		}
	}


	private async publishFile(file: TFile, site: HaloSiteInfo): Promise<void> {
		const md = await this.plugin.app.vault.read(file);
		const cache = this.plugin.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter ?? undefined;
		const frontmatterPosition = cache?.frontmatterPosition;
		const raw = frontmatterPosition ? md.slice(frontmatterPosition.end.offset) : md;
		let processed = raw;
		let coverUrl: string | null = null;
		try {
			processed = await this.processMarkdown(raw, file, site);
			const coverRef = getCoverFromFrontmatter(frontmatter ?? null);
			if (coverRef) {
				coverUrl = await this.resolveCoverUrl(coverRef, file, site);
			}
		} catch (error) {
			const handled =
				error instanceof Error &&
				(error.message === "HALO_ATTACHMENT_PERMISSION" ||
					error.message === "HALO_ATTACHMENT_NOT_CONFIGURED");
			if (!handled) {
				new Notice($t("views.halo.attachment-failed"));
			}
			throw error;
		}

		const existingHalo = this.getFrontmatterHalo(frontmatter);
		if (existingHalo?.site && existingHalo.site !== site.url) {
			new Notice($t("views.halo.site-mismatch"));
			return;
		}

		let params = this.buildDefaultPost();
		let content = this.buildContent(processed);

		if (existingHalo?.name) {
			const existing = await this.getPost(site, existingHalo.name);
			if (existing) {
				params = existing.post;
				content = existing.content;
			}
		}

		content.raw = processed;
		content.content = this.renderHtml(processed);

		const title = this.getFrontmatterString(frontmatter, "title") || file.basename;
		params.spec.title = title;
		params.spec.slug = this.getFrontmatterString(frontmatter, "slug") || this.buildSlug(title);
		params.spec.excerpt = this.buildExcerpt(frontmatter);
		if (coverUrl) {
			params.spec.cover = coverUrl;
		}

		if (Array.isArray(frontmatter?.categories)) {
			params.spec.categories = await this.getCategoryNames(site, frontmatter.categories as string[]);
		}
		if (Array.isArray(frontmatter?.tags)) {
			params.spec.tags = await this.getTagNames(site, frontmatter.tags as string[]);
		}

		if (params.metadata.name) {
			await this.updatePost(site, params, content);
		} else {
			params.metadata.name = this.buildPostName();
			params.metadata.annotations = {
				...(params.metadata.annotations || {}),
				"content.halo.run/content-json": JSON.stringify(content),
			};
			params = await this.createPost(site, params);
		}

		const publishFlag = this.getPublishFlag(frontmatter);
		if (publishFlag !== undefined) {
			await this.changePublish(site, params.metadata.name, publishFlag);
		}
		const latest = await this.getPost(site, params.metadata.name);
		const permalink = this.normalizePermalink(site, latest?.post.status?.permalink || null);

		await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
			fm.halo = {
				site: site.url,
				name: params.metadata.name,
				publish: publishFlag ?? params.spec.publish,
				...(permalink ? { permalink } : {}),
			};
		});
	}

	private buildDefaultPost(): HaloPost {
		return {
			apiVersion: "content.halo.run/v1alpha1",
			kind: "Post",
			metadata: {
				name: "",
				annotations: {},
			},
			spec: {
				allowComment: true,
				baseSnapshot: "",
				categories: [],
				cover: "",
				deleted: false,
				excerpt: { autoGenerate: true, raw: "" },
				headSnapshot: "",
				htmlMetas: [],
				owner: "",
				pinned: false,
				priority: 0,
				publish: false,
				publishTime: "",
				releaseSnapshot: "",
				slug: "",
				tags: [],
				template: "",
				title: "",
				visible: "PUBLIC",
			},
		};
	}

	private buildContent(raw: string): HaloContent {
		return {
			rawType: "markdown",
			raw: raw,
			content: "",
		};
	}

	private renderHtml(raw: string): string {
		const marked = new Marked();
		marked.use({ gfm: true, breaks: true });
		return marked.parse(raw) as string;
	}

	private buildSlug(title: string): string {
		const trimmed = title.trim().toLowerCase();
		const normalized = trimmed.replace(/[^\w一-龥]+/g, "-").replace(/^-+|-+$/g, "");
		return normalized || `post-${Date.now()}`;
	}

	private buildPostName(): string {
		const cryptoAny = globalThis.crypto as { randomUUID?: () => string } | undefined;
		if (cryptoAny?.randomUUID) {
			return cryptoAny.randomUUID();
		}
		return `o2any-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	private buildExcerpt(frontmatter?: Record<string, unknown>): { autoGenerate: boolean; raw: string } {
		const raw = this.getFrontmatterString(frontmatter, "excerpt") || this.getFrontmatterString(frontmatter, "摘要");
		if (raw) {
			return { autoGenerate: false, raw };
		}
		return { autoGenerate: true, raw: "" };
	}

	private getPublishFlag(frontmatter?: Record<string, unknown>): boolean | undefined {
		const halo = this.getFrontmatterHalo(frontmatter);
		if (typeof halo?.publish === "boolean") {
			return halo.publish;
		}
		return this.plugin.settings.haloPublishByDefault;
	}

	private getFrontmatterHalo(frontmatter?: Record<string, unknown>): { site?: string; name?: string; publish?: boolean; permalink?: string } | null {
		const value = frontmatter?.halo;
		if (!value || typeof value !== "object") {
			return null;
		}
		return value as { site?: string; name?: string; publish?: boolean; permalink?: string };
	}

	private getFrontmatterString(frontmatter: Record<string, unknown> | undefined, key: string): string | undefined {
		const value = frontmatter?.[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
		return undefined;
	}

	private buildHeaders(site: HaloSiteInfo): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${site.token}`,
		};
	}

	private async getPost(site: HaloSiteInfo, name: string): Promise<{ post: HaloPost; content: HaloContent } | null> {
		try {
			const headers = this.buildHeaders(site);
			const post = (await requestUrl({
				url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts/${name}`,
				headers,
			}).json) as HaloPost;

			const snapshot = (await requestUrl({
				url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts/${name}/draft?patched=true`,
				headers,
			}).json) as HaloSnapshot;

			const annotations = snapshot.metadata.annotations || {};
			const contentJson = annotations["content.halo.run/content-json"];
			let content: HaloContent = {
				rawType: snapshot.spec?.rawType || "markdown",
				raw: "",
				content: "",
			};
			if (contentJson && typeof contentJson === "string") {
				try {
					content = JSON.parse(contentJson) as HaloContent;
				} catch (error) {
					console.warn("解析 Halo content-json 失败", error);
				}
			}
			return { post, content };
		} catch (error) {
			return null;
		}
	}

	private async createPost(site: HaloSiteInfo, post: HaloPost): Promise<HaloPost> {
		const headers = this.buildHeaders(site);
		const response = await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts`,
			method: "POST",
			contentType: "application/json",
			headers,
			body: JSON.stringify(post),
		});
		return response.json as HaloPost;
	}

	private async updatePost(site: HaloSiteInfo, post: HaloPost, content: HaloContent): Promise<void> {
		const headers = this.buildHeaders(site);
		const name = post.metadata.name;
		await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts/${name}`,
			method: "PUT",
			contentType: "application/json",
			headers,
			body: JSON.stringify(post),
		});
		const snapshot = (await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts/${name}/draft?patched=true`,
			headers,
		}).json) as HaloSnapshot;
		snapshot.metadata.annotations = {
			...(snapshot.metadata.annotations || {}),
			"content.halo.run/content-json": JSON.stringify(content),
		};
		await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts/${name}/draft`,
			method: "PUT",
			contentType: "application/json",
			headers,
			body: JSON.stringify(snapshot),
		});
	}

	private async changePublish(site: HaloSiteInfo, name: string, publish: boolean): Promise<void> {
		const headers = this.buildHeaders(site);
		await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/uc.api.content.halo.run/v1alpha1/posts/${name}/${publish ? "publish" : "unpublish"}`,
			method: "PUT",
			contentType: "application/json",
			headers,
		});
	}

	private normalizePermalink(site: HaloSiteInfo, permalink?: string | null): string | null {
		if (!permalink) {
			return null;
		}
		if (/^https?:\/\//i.test(permalink)) {
			return permalink;
		}
		return `${site.url.replace(/\/+$/, "")}${permalink.startsWith("/") ? "" : "/"}${permalink}`;
	}

	private async processMarkdown(raw: string, file: TFile, site: HaloSiteInfo): Promise<string> {
		let result = raw;
		result = await this.replaceImages(result, file, site);
		result = await this.replaceWikiLinks(result, file, site);
		return result;
	}

	private async replaceImages(raw: string, file: TFile, site: HaloSiteInfo): Promise<string> {
		return this.replaceOutsideCodeBlocks(raw, async (segment) => {
			let output = segment;
			const embedRegex = /!\[\[([^\]]+)\]\]/g;
			const embeds = Array.from(segment.matchAll(embedRegex));
			for (const match of embeds) {
				const token = match[0];
				const inner = match[1];
				const target = inner.split("|")[0].trim();
				if (!target) {
					continue;
				}
				const remote = this.normalizeRemoteImage(target);
				if (remote) {
					output = output.replace(token, `![](${remote})`);
					continue;
				}
				const uploadUrl = await this.uploadLocalImage(target, file, site);
				if (uploadUrl) {
					const alt = this.extractImageAlt(target);
					output = output.replace(token, `![${alt}](${uploadUrl})`);
				}
			}

			const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			const mdImages = Array.from(output.matchAll(mdImageRegex));
			for (const match of mdImages) {
				const token = match[0];
				const alt = match[1];
				const rawUrl = match[2].trim();
				const cleanedUrl = rawUrl.split(/\s+/)[0].replace(/^<|>$/g, "");
				const remote = this.normalizeRemoteImage(cleanedUrl);
				if (remote) {
					continue;
				}
				const uploadUrl = await this.uploadLocalImage(cleanedUrl, file, site);
				if (uploadUrl) {
					output = output.replace(token, `![${alt}](${uploadUrl})`);
				}
			}
			return output;
		});
	}

	private async replaceWikiLinks(raw: string, file: TFile, site: HaloSiteInfo): Promise<string> {
		return this.replaceOutsideCodeBlocks(raw, async (segment) => {
			const linkRegex = /\[\[([^\]]+)\]\]/g;
			const matches = Array.from(segment.matchAll(linkRegex));
			let output = segment;
			for (const match of matches) {
				const token = match[0];
				const inner = match[1];
				if (!inner) {
					continue;
				}
				const [targetRaw, aliasRaw] = inner.split("|");
				const target = targetRaw.trim();
				const alias = (aliasRaw || targetRaw).trim();
				const permalink = await this.resolvePermalinkForNote(target, file, site);
				if (permalink) {
					output = output.replace(token, `[${alias}](${permalink})`);
				} else {
					output = output.replace(token, alias);
				}
			}
			return output;
		});
	}

	private async replaceOutsideCodeBlocks(raw: string, replacer: (segment: string) => Promise<string>): Promise<string> {
		const codeRegex = /```[\s\S]*?```/g;
		let result = "";
		let lastIndex = 0;
		for (const match of raw.matchAll(codeRegex)) {
			const index = match.index ?? 0;
			const before = raw.slice(lastIndex, index);
			result += await replacer(before);
			result += match[0];
			lastIndex = index + match[0].length;
		}
		result += await replacer(raw.slice(lastIndex));
		return result;
	}

	private normalizeRemoteImage(url: string): string | null {
		if (/^(https?:|data:)/i.test(url)) {
			return url;
		}
		return null;
	}

	private extractImageAlt(path: string): string {
		const clean = path.split("/").pop() || path;
		return clean.replace(/\.[a-zA-Z0-9]+$/, "");
	}

	private resolveLocalImageFile(path: string, activeFile: TFile): TFile | null {
		const cleaned = path.split("|")[0].split("?")[0].split("#")[0].trim();
		if (!cleaned) {
			return null;
		}
		const direct = this.plugin.app.vault.getAbstractFileByPath(cleaned);
		if (direct instanceof TFile) {
			return direct;
		}
		const linked = this.plugin.app.metadataCache.getFirstLinkpathDest(cleaned, activeFile.path);
		if (linked instanceof TFile) {
			return linked;
		}
		const attachmentFolderPath = (this.plugin.app.vault as { config?: { attachmentFolderPath?: string } }).config?.attachmentFolderPath || "";
		if (attachmentFolderPath) {
			const baseDir = activeFile.parent?.path ?? "";
			const basename = cleaned.split("/").pop() || cleaned;
			const candidates = attachmentFolderPath.startsWith("./")
				? [
					`${baseDir}/${attachmentFolderPath.slice(2)}/${basename}`,
					`${baseDir}/${attachmentFolderPath.slice(2)}/${cleaned}`,
				]
				: [
					`${attachmentFolderPath}/${basename}`,
					`${attachmentFolderPath}/${cleaned}`,
					`${baseDir}/${attachmentFolderPath}/${basename}`,
					`${baseDir}/${attachmentFolderPath}/${cleaned}`,
				];
			for (const candidate of candidates) {
				const file = this.plugin.app.vault.getAbstractFileByPath(candidate);
				if (file instanceof TFile) {
					return file;
				}
			}
		}
		return null;
	}

	private async uploadLocalImage(path: string, file: TFile, site: HaloSiteInfo): Promise<string | null> {
		const resolved = this.resolveLocalImageFile(path, file);
		if (!resolved) {
			return null;
		}
		if (this.imageCache.has(resolved.path)) {
			return this.imageCache.get(resolved.path) || null;
		}
		const data = await this.plugin.app.vault.readBinary(resolved);
		const uploaded = await this.uploadAttachment(site, data, resolved.name);
		if (uploaded) {
			this.imageCache.set(resolved.path, uploaded);
		}
		return uploaded;
	}

	private async uploadAttachment(site: HaloSiteInfo, data: ArrayBuffer, filename: string): Promise<string | null> {
		let safeName = filename.replace(/[\r\n"]/g, "_");
		if (safeName.length > 180) {
			const dotIndex = safeName.lastIndexOf(".");
			const ext = dotIndex > -1 ? safeName.slice(dotIndex) : "";
			safeName = safeName.slice(0, 180 - ext.length) + ext;
		}
		const boundary = `----O2AnyHaloBoundary${Date.now()}`;
		const encoder = new TextEncoder();
		const header =
			`--${boundary}\r\n` +
			`Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
			`Content-Type: application/octet-stream\r\n\r\n`;
		const footer =
			`\r\n--${boundary}\r\n` +
			`Content-Disposition: form-data; name="filename"\r\n\r\n` +
			`${safeName}\r\n` +
			`--${boundary}--\r\n`;

		const body = this.concatBuffers([
			encoder.encode(header),
			new Uint8Array(data),
			encoder.encode(footer),
		]);
		const endpoints = [
			`${site.url.replace(/\/+$/, "")}/apis/console.api.storage.halo.run/v1alpha1/attachments/-/upload`,
			`${site.url.replace(/\/+$/, "")}/apis/uc.api.storage.halo.run/v1alpha1/attachments/-/upload`,
		];
		let seenAuthError = false;
		let seenConfigError = false;
		for (const url of endpoints) {
			const response = await requestUrl({
				url,
				method: "POST",
				headers: {
					Authorization: `Bearer ${site.token}`,
					"Content-Type": `multipart/form-data; boundary=${boundary}`,
				},
				body: body.buffer as ArrayBuffer,
				throw: false,
			});
			if (response.status == 404) {
				continue;
			}
			if (response.status == 401 || response.status == 403) {
				seenAuthError = true;
				continue;
			}
			const detail: string =
				response.json && typeof (response.json as { detail?: unknown }).detail == "string"
					? (response.json as { detail?: string }).detail ?? ""
					: "";
			if (response.status == 400 && detail.includes("Attachment system setting is not configured")) {
				seenConfigError = true;
				continue;
			}
			if (response.status >= 400) {
				throw new Error(`Upload failed: ${response.status} ${response.text}`);
			}
			const attachment = response.json as { status?: { permalink?: string } };
			const permalink = attachment?.status?.permalink;
			if (permalink) {
				return this.normalizePermalink(site, permalink);
			}
		}

		if (seenAuthError) {
			if (!this.uploadPermissionNotified) {
				new Notice($t("views.halo.attachment-permission"));
				this.uploadPermissionNotified = true;
			}
			throw new Error("HALO_ATTACHMENT_PERMISSION");
		}
		if (seenConfigError) {
			if (!this.uploadConfigNotified) {
				new Notice($t("views.halo.attachment-not-configured"));
				this.uploadConfigNotified = true;
			}
			throw new Error("HALO_ATTACHMENT_NOT_CONFIGURED");
		}
		throw new Error("HALO_ATTACHMENT_UPLOAD_FAILED");
	}

	private concatBuffers(parts: Uint8Array[]): Uint8Array {
		const total = parts.reduce((sum, part) => sum + part.length, 0);
		const output = new Uint8Array(total);
		let offset = 0;
		for (const part of parts) {
			output.set(part, offset);
			offset += part.length;
		}
		return output;
	}

	private async resolvePermalinkForNote(target: string, activeFile: TFile, site: HaloSiteInfo): Promise<string | null> {
		const clean = target.split("#")[0].trim();
		if (!clean) {
			return null;
		}
		if (this.linkCache.has(clean)) {
			return this.linkCache.get(clean) || null;
		}
		const linked = this.plugin.app.metadataCache.getFirstLinkpathDest(clean, activeFile.path);
		if (!(linked instanceof TFile)) {
			return null;
		}
		const matterData = this.plugin.app.metadataCache.getFileCache(linked)?.frontmatter;
		if (matterData?.halo?.site && matterData.halo.site !== site.url) {
			return null;
		}
		if (matterData?.halo?.permalink) {
			const normalized = this.normalizePermalink(site, matterData.halo.permalink);
			if (normalized) {
				this.linkCache.set(clean, normalized);
			}
			return normalized;
		}
		if (matterData?.halo?.name) {
			const post = await this.getPost(site, matterData.halo.name);
			const permalink = this.normalizePermalink(site, post?.post.status?.permalink || null);
			if (permalink) {
				this.linkCache.set(clean, permalink);
			}
			return permalink;
		}
		return null;
	}

	private async resolveCoverUrl(ref: string, activeFile: TFile, site: HaloSiteInfo): Promise<string | null> {
		const trimmed = ref.trim();
		const remote = this.normalizeRemoteImage(trimmed);
		if (remote) {
			return remote;
		}
		let path = trimmed;
		if (path.startsWith("vault:")) {
			path = path.slice("vault:".length);
		}
		const uploadUrl = await this.uploadLocalImage(path, activeFile, site);
		return uploadUrl ?? null;
	}

	private async getCategories(site: HaloSiteInfo): Promise<HaloCategory[]> {
		const headers = this.buildHeaders(site);
		const resp = await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/content.halo.run/v1alpha1/categories`,
			headers,
		});
		return (resp.json as { items: HaloCategory[] }).items;
	}

	private async getTags(site: HaloSiteInfo): Promise<HaloTag[]> {
		const headers = this.buildHeaders(site);
		const resp = await requestUrl({
			url: `${site.url.replace(/\/+$/, "")}/apis/content.halo.run/v1alpha1/tags`,
			headers,
		});
		return (resp.json as { items: HaloTag[] }).items;
	}

	private async getCategoryNames(site: HaloSiteInfo, displayNames: string[]): Promise<string[]> {
		const all = await this.getCategories(site);
		const notExist = displayNames.filter((name) => !all.find((item) => item.spec.displayName === name));
		const headers = this.buildHeaders(site);
		const createReqs = notExist.map((name, index) =>
			requestUrl({
				url: `${site.url.replace(/\/+$/, "")}/apis/content.halo.run/v1alpha1/categories`,
				method: "POST",
				contentType: "application/json",
				headers,
				body: JSON.stringify({
					spec: {
						displayName: name,
						slug: this.buildSlug(name),
						description: "",
						cover: "",
						template: "",
						priority: all.length + index,
						children: [],
					},
					apiVersion: "content.halo.run/v1alpha1",
					kind: "Category",
					metadata: { name: "", generateName: "category-" },
				}),
			})
		);
		const created = await Promise.all(createReqs);
		const existingNames = displayNames
			.map((name) => all.find((item) => item.spec.displayName === name)?.metadata.name)
			.filter(Boolean) as string[];
		return [...existingNames, ...created.map((item) => (item.json as { metadata: { name: string } }).metadata.name)];
	}

	private async getTagNames(site: HaloSiteInfo, displayNames: string[]): Promise<string[]> {
		const all = await this.getTags(site);
		const notExist = displayNames.filter((name) => !all.find((item) => item.spec.displayName === name));
		const headers = this.buildHeaders(site);
		const createReqs = notExist.map((name) =>
			requestUrl({
				url: `${site.url.replace(/\/+$/, "")}/apis/content.halo.run/v1alpha1/tags`,
				method: "POST",
				contentType: "application/json",
				headers,
				body: JSON.stringify({
					spec: {
						displayName: name,
						slug: this.buildSlug(name),
						color: "#ffffff",
						cover: "",
					},
					apiVersion: "content.halo.run/v1alpha1",
					kind: "Tag",
					metadata: { name: "", generateName: "tag-" },
				}),
			})
		);
		const created = await Promise.all(createReqs);
		const existingNames = displayNames
			.map((name) => all.find((item) => item.spec.displayName === name)?.metadata.name)
			.filter(Boolean) as string[];
		return [...existingNames, ...created.map((item) => (item.json as { metadata: { name: string } }).metadata.name)];
	}
}
