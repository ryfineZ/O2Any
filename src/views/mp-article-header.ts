/**
 *  WeChat MP Article Header settings
 */
import {
	FileSystemAdapter,
	debounce,
	Notice,
	Platform,
	TextAreaComponent,
	TFile,
} from "obsidian";
import { LocalDraftItem, LocalDraftManager } from "src/assets/draft-manager";
import One2MpPlugin from "src/main";
import { UrlUtils } from "src/utils/urls";
import { fetchImageBlob } from "src/utils/utils";
import { WechatClient } from "src/wechat-api/wechat-client";
import { MaterialMeidaItem } from "src/wechat-api/wechat-types";
import { $t } from "src/lang/i18n";
import {
	FRONTMATTER_ALIASES,
	FRONTMATTER_CANONICAL_KEYS,
	getCoverFromFrontmatter,
	getFrontmatterBool,
	getFrontmatterString,
} from "src/utils/wechat-frontmatter";

export class MPArticleHeader {
	updateDraftDraftId(mediaId: string) {
		if (this.activeLocalDraft !== undefined) {
			this.activeLocalDraft.last_draft_id = mediaId;
		}
	}
	private resetCoverTransform() {
		this.coverTransform = { scale: 1, offsetX: 0, offsetY: 0 };
	}

	private async resetCoverCropState(ref?: string | null) {
		if (!this.activeLocalDraft) {
			return;
		}
		delete this.activeLocalDraft.cover_crop_scale;
		delete this.activeLocalDraft.cover_crop_offset_x;
		delete this.activeLocalDraft.cover_crop_offset_y;
		delete this.activeLocalDraft.pic_crop_235_1;
		delete this.activeLocalDraft.pic_crop_1_1;
		if (ref !== undefined) {
			this.activeLocalDraft.cover_crop_ref = ref || undefined;
		} else {
			delete this.activeLocalDraft.cover_crop_ref;
		}
		await this.localDraftmanager.setDraft(this.activeLocalDraft);
	}

	private restoreCoverTransform() {
		this.resetCoverTransform();
	}

	private applyCoverTransform(persist = false) {
		void persist;
		if (!this.coverImageEl || !this.coverImageWrap) {
			return;
		}
		this.coverImageWrap.setCssProps({
			left: "0",
			top: "0",
			width: "100%",
			height: "100%",
			transform: "none",
		});
		this.coverImageEl.setCssProps({
			width: "100%",
			height: "100%",
			"object-fit": "cover",
		});
	}

	private handleCoverFrameResize() {
		if (!this.coverImageEl) {
			return;
		}
		this.applyCoverTransform(false);
	}


	private plugin: One2MpPlugin;
	private cover_image: string | null;
	private coverImageRef: string | null = null;
	private coverFrame: HTMLElement;
	private coverImageWrap: HTMLDivElement | null = null;
	private coverImageEl: HTMLImageElement | null = null;
	private coverNaturalWidth = 0;
	private coverNaturalHeight = 0;
	private coverTransform = { scale: 1, offsetX: 0, offsetY: 0 };
	private coverResizeDebounced: () => void;
	private coverResizeObserver: ResizeObserver | null = null;
	private digestInput: TextAreaComponent;
	private activeLocalDraft: LocalDraftItem | undefined;
	private localDraftmanager: LocalDraftManager;
	private readonly coverFrontmatterKey = FRONTMATTER_CANONICAL_KEYS.cover;
	private readonly coverVaultPrefix = "vault:";
	private rootEl: HTMLElement;
	constructor(plugin: One2MpPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.localDraftmanager = LocalDraftManager.getInstance(plugin);
		this.BuildUI(containerEl);
		this.coverResizeDebounced = debounce(
			() => this.handleCoverFrameResize(),
			80
		);
		if (typeof ResizeObserver !== "undefined") {
			this.coverResizeObserver = new ResizeObserver(() => {
				this.coverResizeDebounced();
			});
			this.coverResizeObserver.observe(this.coverFrame);
		}
		this.plugin.messageService.registerListener(
			"wechat-account-changed",
			() => {
				void this.updateLocalDraft();
			}
		);

		this.plugin.messageService.registerListener(
			"active-file-changed",
			() => {
				void this.updateLocalDraft();
			}
		);
		this.plugin.messageService.registerListener(
			"set-draft-cover-image",
			(url: string) => {
				this.coverImageRef = url;
				this.cover_image = this.resolveCoverUrl(url);
				void this.resetCoverCropState(this.coverImageRef);
				this.setCoverImage(this.cover_image);
				void this.saveCoverToFrontmatter(this.coverImageRef);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = undefined;
					void this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);
		this.plugin.messageService.registerListener(
			"set-image-as-cover",
			(item: MaterialMeidaItem) => {
				this.coverImageRef = item.url;
				this.cover_image = this.resolveCoverUrl(item.url);
				void this.resetCoverCropState(this.coverImageRef);
				this.setCoverImage(this.cover_image);
				void this.saveCoverToFrontmatter(this.coverImageRef);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = item.media_id;
					void this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);
		void this.updateLocalDraft();
	}

	onNoteRename(file: TFile) {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (activeFile === undefined || file !== activeFile) {
			return;
		}

		if (this.activeLocalDraft !== undefined) {
			this.activeLocalDraft.notePath = file.path;
			const dm = LocalDraftManager.getInstance(this.plugin);
			dm.setDraft(this.activeLocalDraft);
		}
	}

	public getActiveLocalDraft() {
		return this.activeLocalDraft;
	}
	public getRootEl() {
		return this.rootEl;
	}

	private BuildUI(containerEl: HTMLElement) {
        // Redesigned Metadata Card
		this.rootEl = containerEl.createDiv({
			cls: "one2mp-meta-card",
		});
		
        // Left: Cover Image Container
        const coverContainer = this.rootEl.createDiv({ cls: "one2mp-cover-container" });
        // Empty state hint
        coverContainer.createDiv({ cls: "one2mp-cover-hint", text: $t("views.article-header.cover-image-description") });
        this.coverFrame = this.createCoverFrame(coverContainer);
        // Right: Digest / Meta Container
        const metaContainer = this.rootEl.createDiv({ cls: "one2mp-digest-container" });
        
        // Digest Input
        this.digestInput = new TextAreaComponent(metaContainer);
        this.digestInput.setPlaceholder($t("views.article-header.digest-text"));
        this.digestInput.inputEl.rows = 4;
        this.digestInput.inputEl.addClass("one2mp-digest-input");
        this.digestInput.onChange((value) => {
			 const activeDraft = this.activeLocalDraft;
             if (!activeDraft) {
				 return;
			 }
             activeDraft.digest = value;
             void (async () => {
                 await this.localDraftmanager.setDraft(activeDraft);
                 // 可选：同步回 frontmatter
                 await this.saveDigestToFrontmatter(value);
             })();
        });
	}
    
    private async saveDigestToFrontmatter(text: string) {
        const file = this.getActiveMarkdownFile();
        if (!file) return;
        await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
            fm[FRONTMATTER_CANONICAL_KEYS.digest] = text;
             // clear alias
            if (fm[FRONTMATTER_ALIASES.digest[0]] && FRONTMATTER_ALIASES.digest[0] !== FRONTMATTER_CANONICAL_KEYS.digest) {
                 delete fm[FRONTMATTER_ALIASES.digest[0]];
            }
        });
    }

	private getActiveMarkdownFile(): TFile | null {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) {
			return null;
		}
		if (file.extension !== "md" && file.extension !== "markdown") {
			return null;
		}
		return file;
	}

	private getCoverFromFrontmatter(): string | null {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return null;
		}
		const frontmatter =
			this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
		return getCoverFromFrontmatter(frontmatter);
	}

	private getVaultRelativePathFromAbsolute(absPath: string): string | null {
		const adapter = this.plugin.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return null;
		}
		const basePath = adapter.getBasePath();
		if (!absPath.startsWith(basePath)) {
			return null;
		}
		let relative = absPath.slice(basePath.length);
		if (relative.startsWith("/") || relative.startsWith("\\")) {
			relative = relative.slice(1);
		}
		return relative.replace(/\\/g, "/");
	}

	private resolveCoverUrl(ref: string | null): string | null {
		if (!ref || !ref.trim()) {
			return null;
		}
		const trimmed = ref.trim();
		if (trimmed.startsWith(this.coverVaultPrefix)) {
			const vaultPath = trimmed.slice(this.coverVaultPrefix.length);
			const file = this.plugin.app.vault.getAbstractFileByPath(vaultPath);
			if (file instanceof TFile) {
				return this.plugin.app.vault.getResourcePath(file);
			}
			return null;
		}
		if (trimmed.startsWith("obsidian://")) {
			const urlParser = new UrlUtils(this.plugin.app);
			const filePath = urlParser.parseObsidianUrl(trimmed);
			if (filePath) {
				const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					return this.plugin.app.vault.getResourcePath(file);
				}
			}
		}
		const vaultFile = this.plugin.app.vault.getAbstractFileByPath(trimmed);
		if (vaultFile instanceof TFile) {
			return this.plugin.app.vault.getResourcePath(vaultFile);
		}
		return trimmed;
	}

	private getCoverFileFromRef(ref: string | null): TFile | null {
		if (!ref || !ref.trim()) {
			return null;
		}
		const trimmed = ref.trim();
		if (trimmed.startsWith(this.coverVaultPrefix)) {
			const vaultPath = trimmed.slice(this.coverVaultPrefix.length);
			const file = this.plugin.app.vault.getAbstractFileByPath(vaultPath);
			return file instanceof TFile ? file : null;
		}
		if (trimmed.startsWith("obsidian://")) {
			const urlParser = new UrlUtils(this.plugin.app);
			const filePath = urlParser.parseObsidianUrl(trimmed);
			if (filePath) {
				const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
				return file instanceof TFile ? file : null;
			}
		}
		const vaultFile = this.plugin.app.vault.getAbstractFileByPath(trimmed);
		return vaultFile instanceof TFile ? vaultFile : null;
	}

	private async saveCoverToFrontmatter(url: string | null) {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return;
		}
		await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (url && url.trim() !== "") {
				frontmatter[this.coverFrontmatterKey] = url;
				for (const key of FRONTMATTER_ALIASES.cover) {
					if (key !== this.coverFrontmatterKey) {
						delete frontmatter[key];
					}
				}
			} else {
				for (const key of FRONTMATTER_ALIASES.cover) {
					delete frontmatter[key];
				}
			}
		});
	}
    
	private createCoverFrame(container: HTMLElement) {
		// 文章封面区域：支持拖拽图片并写入草稿元数据
		const coverframe = container.createDiv({
			cls: "cover-frame",
			attr: { droppable: true },
		});
		coverframe.ondragenter = (e) => {
			e.preventDefault();
			coverframe.addClass("image-on-dragover");
		};
		coverframe.ondragleave = (e) => {
			e.preventDefault();
			coverframe.removeClass("image-on-dragover");
		};
		coverframe.ondragover = (e) => {
			e.preventDefault();
		};
		coverframe.addEventListener("drop", (e) => {
			void this.handleCoverDrop(e, coverframe);
		});

		return coverframe;
	}

	private async handleCoverDrop(event: DragEvent, coverframe: HTMLElement) {
		event.preventDefault();

		const dataTransfer = event.dataTransfer;
		let url = dataTransfer?.getData("text/uri-list")?.trim() ?? "";
		if (!url) {
			url = dataTransfer?.getData("text/plain")?.trim() ?? "";
		}
		if (url.includes("\n")) {
			const lines = url
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#"));
			url = lines[0] ?? "";
		}
		if (!this.activeLocalDraft) {
			await this.updateLocalDraft();
		}
		if (url) {
			let coverRef: string | null = null;
			let coverUrl: string | null = null;
			if (url.startsWith("obsidian://")) {
				// 来自仓库的图片
				const urlParser = new UrlUtils(this.plugin.app);
				const filePath = urlParser.parseObsidianUrl(url);
				if (filePath) {
					coverRef = `${this.coverVaultPrefix}${filePath}`;
					coverUrl = this.resolveCoverUrl(coverRef);
				}
			} else if (url.startsWith("http") || url.startsWith("https")) {
				coverRef = url;
				coverUrl = url;
				if (this.activeLocalDraft) {
					const mediaId = await this.getCoverImageMediaId(url);
					if (mediaId) {
						coverframe.setAttr("data-media_id", mediaId);
						this.activeLocalDraft.thumb_media_id = mediaId;
					} else {
						coverframe.removeAttribute("data-media_id");
						this.activeLocalDraft.thumb_media_id = undefined;
					}
				}
			} else if (url.startsWith("file://")) {
				// 来自本地文件的图片
				const filePath = decodeURIComponent(url.replace("file://", ""));
				const vaultPath = this.getVaultRelativePathFromAbsolute(filePath);
				if (vaultPath) {
					coverRef = `${this.coverVaultPrefix}${vaultPath}`;
					coverUrl = this.resolveCoverUrl(coverRef);
				} else {
					if (Platform.isMobile) {
						new Notice($t("views.article-header.cover-file-not-supported"));
						coverRef = null;
						coverUrl = "";
					} else {
						coverRef = url;
						coverUrl = url;
					}
				}
			} else {
				const vaultFile = this.plugin.app.vault.getAbstractFileByPath(url);
				if (vaultFile instanceof TFile) {
					coverRef = `${this.coverVaultPrefix}${url}`;
					coverUrl = this.resolveCoverUrl(coverRef);
				} else {
					coverRef = null;
					coverUrl = "";
					this.setCoverImageXY();
				}
			}
			if (this.activeLocalDraft !== undefined) {
				this.activeLocalDraft.cover_image_url = coverRef || "";
				await this.localDraftmanager.setDraft(this.activeLocalDraft);
			}
			this.coverImageRef = coverRef;
			this.cover_image = coverUrl;
			await this.resetCoverCropState(coverRef);
			await this.saveCoverToFrontmatter(this.coverImageRef);
			this.setCoverImage(this.cover_image || "");
		}
		coverframe.removeClass("image-on-dragover");
	}
	
	setCoverImage(url: string | null) {
		while (this.coverFrame.firstChild) {
			this.coverFrame.firstChild.remove();
		}
		this.coverImageEl = null;
		this.coverImageWrap = null;
		this.coverNaturalWidth = 0;
		this.coverNaturalHeight = 0;
		if (!url) {
            this.coverFrame.parentElement?.removeClass("has-image");
			return;
		}
        this.coverFrame.parentElement?.addClass("has-image");

		const img = new Image();
		img.decoding = "async";
		img.loading = "lazy";
		const wrap = document.createElement("div");
		wrap.className = "one2mp-cover-image-wrap";
		img.className = "one2mp-cover-image";
		wrap.appendChild(img);
		this.coverFrame.appendChild(wrap);
		this.coverImageWrap = wrap;
		this.coverImageEl = img;
		let didLoad = false;
		const handleLoad = () => {
			if (didLoad) {
				return;
			}
			didLoad = true;
			this.coverNaturalWidth = img.naturalWidth || img.width;
			this.coverNaturalHeight = img.naturalHeight || img.height;
			this.resetCoverTransform();
			this.restoreCoverTransform();
			this.applyCoverTransform(false);
		};
		img.onload = handleLoad;
		img.src = url;
		if (img.complete && img.naturalWidth) {
			handleLoad();
		}
	}
	resetImage() {
		this.setCoverImageXY(0, 0);
	}

	async checkCoverImage() {
		await this.syncDraftFromFrontmatter();
		if (this.activeLocalDraft !== undefined) {
			if (
				this.activeLocalDraft.thumb_media_id === undefined ||
				!this.activeLocalDraft.thumb_media_id
			) {
				const ref = this.coverImageRef || this.cover_image;
				if (ref) {
					const media_id = await this.getCoverImageMediaId(
						ref,
						true
					);
					this.activeLocalDraft.thumb_media_id = media_id;
					return true;
				}
			} else {
				return true;
			}
		}
		return false;
	}
	async getCoverImageMediaId(url: string, upload: boolean = false) {
		let _media_id: string | undefined;
		if (upload) {
			let blob: Blob | undefined;
			const file = this.getCoverFileFromRef(url);
			if (file) {
				const data = await this.plugin.app.vault.readBinary(file);
				blob = new Blob([data]);
			} else {
				const resolvedUrl = this.resolveCoverUrl(url);
				blob = await fetchImageBlob(resolvedUrl || url, this.plugin.app);
			}
			if (blob === undefined || !blob) {
				return;
			}

			const res = await WechatClient.getInstance(this.plugin).uploadMaterial(
				blob,
				"banner-cover.png",
				"image"
			);

			if (res) {
				const { errcode, media_id } = res;

				if (errcode !== 0) {
					new Notice(
						$t("views.article-header.upload-cover-image-error")
					);
					return;
				} else {
					_media_id = media_id;
				}
			}
		}
		return _media_id;
	}
	private setCoverImageXY(x: number = 0, y: number = 0) {
		void x;
		void y;
		if (!this.coverImageEl) {
			this.setCoverImage(this.cover_image);
			return;
		}
		this.applyCoverTransform(false);
	}

	private getFrontmatter(): Record<string, unknown> | null {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return null;
		}
		return this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
	}

	private async migrateFrontmatterKeys() {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return;
		}
		const frontmatter = this.getFrontmatter();
		if (!frontmatter) {
			return;
		}
		const mappings = [
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.title,
				aliases: FRONTMATTER_ALIASES.title,
			},
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.author,
				aliases: FRONTMATTER_ALIASES.author,
			},
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.digest,
				aliases: FRONTMATTER_ALIASES.digest,
			},
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.sourceUrl,
				aliases: FRONTMATTER_ALIASES.sourceUrl,
			},
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.cover,
				aliases: FRONTMATTER_ALIASES.cover,
			},
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.openComment,
				aliases: FRONTMATTER_ALIASES.openComment,
			},
			{
				canonical: FRONTMATTER_CANONICAL_KEYS.onlyFans,
				aliases: FRONTMATTER_ALIASES.onlyFans,
			},
		];
		const hasLegacyKey = mappings.some((mapping) =>
			mapping.aliases.some(
				(key) => key !== mapping.canonical && frontmatter[key] !== undefined
			)
		);
		if (!hasLegacyKey) {
			return;
		}
		await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
			for (const mapping of mappings) {
				if (fm[mapping.canonical] === undefined) {
					for (const key of mapping.aliases) {
						if (key === mapping.canonical) {
							continue;
						}
						if (fm[key] !== undefined) {
							fm[mapping.canonical] = fm[key];
							delete fm[key];
							break;
						}
					}
				} else {
					for (const key of mapping.aliases) {
						if (key !== mapping.canonical && fm[key] !== undefined) {
							delete fm[key];
						}
					}
				}
			}
		});
	}

	private async syncDraftFromFrontmatter() {
		if (!this.activeLocalDraft) {
			return;
		}
		const frontmatter = this.getFrontmatter();
		const file = this.getActiveMarkdownFile();
		const title =
			getFrontmatterString(frontmatter, FRONTMATTER_ALIASES.title) ||
			file?.basename ||
			this.activeLocalDraft.title ||
			"";
		const author = getFrontmatterString(
			frontmatter,
			FRONTMATTER_ALIASES.author
		);
		const digest = getFrontmatterString(
			frontmatter,
			FRONTMATTER_ALIASES.digest
		);
		const sourceUrl = getFrontmatterString(
			frontmatter,
			FRONTMATTER_ALIASES.sourceUrl
		);
		const needOpen = getFrontmatterBool(
			frontmatter,
			FRONTMATTER_ALIASES.openComment
		);
		const onlyFans = getFrontmatterBool(
			frontmatter,
			FRONTMATTER_ALIASES.onlyFans
		);

		this.activeLocalDraft.title = title;
		this.activeLocalDraft.author = author;
		this.activeLocalDraft.digest = digest;
        if(this.digestInput) this.digestInput.setValue(digest || "");
        
		this.activeLocalDraft.content_source_url = sourceUrl;

		if (needOpen !== undefined) {
			this.activeLocalDraft.need_open_comment = needOpen;
		} else if (this.activeLocalDraft.need_open_comment === undefined) {
			this.activeLocalDraft.need_open_comment = 1;
		}
		if (onlyFans !== undefined) {
			this.activeLocalDraft.only_fans_can_comment = onlyFans;
		} else if (this.activeLocalDraft.only_fans_can_comment === undefined) {
			this.activeLocalDraft.only_fans_can_comment = 0;
		}

		await this.localDraftmanager.setDraft(this.activeLocalDraft);
		this.plugin.messageService.sendMessage("draft-title-updated", title);
	}
	async updateLocalDraft() {
		this.activeLocalDraft =
			await this.localDraftmanager.getDrafOfActiveNote();
		await this.updateHeaderProporties();
		return true;
	}
	async updateHeaderProporties() {
		await this.migrateFrontmatterKeys();
		const frontmatterCover = this.getCoverFromFrontmatter();
		let coverRef = frontmatterCover;
		if (this.activeLocalDraft !== undefined) {
			await this.syncDraftFromFrontmatter();
			if (!coverRef && this.activeLocalDraft.cover_image_url) {
				coverRef = this.activeLocalDraft.cover_image_url;
			}
			this.activeLocalDraft.cover_image_url = coverRef || "";
			if (this.activeLocalDraft.cover_crop_ref !== (coverRef || "")) {
				await this.resetCoverCropState(coverRef || undefined);
			}
			await this.localDraftmanager.setDraft(this.activeLocalDraft);
		}

		const nextCoverRef = coverRef || "";
		const prevCoverRef = this.coverImageRef || "";
		const coverChanged = nextCoverRef !== prevCoverRef;
		this.coverImageRef = nextCoverRef;
		this.cover_image = this.resolveCoverUrl(this.coverImageRef);

		if (coverChanged || !this.coverImageEl) {
			this.setCoverImage(this.cover_image);
		} else {
			this.setCoverImageXY();
		}
	}
}
