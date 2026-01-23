/**
 * Define the right-side leaf of view as Previewer view
 */

import { EditorView } from "@codemirror/view";
import {
	Component,
	debounce,
	DropdownComponent,
	EventRef,
	FileSystemAdapter,
	ItemView,
	MarkdownView,
	Notice,
	sanitizeHTMLToDom,
	Setting,
	setIcon,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { $t } from "src/lang/i18n";
import { serializeChildren } from "../utils/dom";
import One2MpPlugin from "src/main";
import { ObsidianMarkdownRenderer } from "src/render/markdown-render";
import { PreviewRender } from "src/render/marked-extensions/extension";
import { exportRedBookPackage } from "src/platforms/redbook/redbook-export";
import { RedBookParser } from "src/platforms/redbook/redbook-parser";
import {
	uploadCanvas,
	applyInlineCalloutTextColor,
	uploadSVGs,
	uploadURLImage,
	uploadURLVideo,
} from "src/render/post-render";
import { MpcardDataManager } from "src/render/marked-extensions/mpcard-data";
import { WechatRender } from "src/render/wechat-render";
import { ResourceManager } from "../assets/resource-manager";
import { WechatClient } from "../wechat-api/wechat-client";
import { MPArticleHeader } from "./mp-article-header";
import { WebViewModal } from "./webview";
import { PublishConfigModal } from "src/modals/publish-config-modal";
import { DualIps } from "src/utils/ip-address";
import { UrlUtils } from "src/utils/urls";
import type { ThemeSelector } from "../theme/theme-selector";

export const VIEW_TYPE_ONE2MP_PREVIEW = "one2mp-article-preview";
export interface ElectronWindow extends Window {
	WEBVIEW_SERVER_URL: string;
}
type PreviewPlatform = "wechat" | "redbook" | "halo";

/**
 * PreviewPanel is a view component that renders and previews markdown content with WeChat integration.
 * It provides real-time rendering, theme selection, and draft management capabilities for WeChat articles.
 * 
 * Features:
 * - Real-time markdown rendering with debounced updates
 * - Theme selection and application
 * - Draft management (send to WeChat draft box, copy to clipboard)
 * - Frontmatter property handling
 * - 常规 DOM 渲染容器
 * 
 * The panel integrates with WeChatClient for draft operations and maintains article properties in sync with markdown frontmatter.
 */
export class PreviewPanel extends ItemView implements PreviewRender {
	markdownView: MarkdownView | null = null;
	private articleDiv: HTMLDivElement;
	private listeners: EventRef[] = [];
	private messageUnsubscribes: Array<() => void> = [];
	currentView: EditorView;
	private wechatClient: WechatClient;
	private plugin: One2MpPlugin;
	private themeSelector: ThemeSelector | null = null;
	private themeManagerModule: typeof import("../theme/theme-manager") | null = null;
	private allowRender = false;
	private initialRenderScheduled = false;
	private currentPlatform: PreviewPlatform = "wechat";
	private platformTabs: Map<PreviewPlatform, HTMLButtonElement> = new Map();
	private platformPanels: Map<PreviewPlatform, HTMLDivElement> = new Map();
	private redbookParser = new RedBookParser();
	private redbookPreviewEl: HTMLDivElement | null = null;
	private redbookContent = "";
	private redbookCoverFrame: HTMLDivElement | null = null;
	private redbookCoverImageEl: HTMLImageElement | null = null;
	private redbookCoverRef: string | null = null;
	private readonly redbookCoverFrontmatterKey = "小红书封面图";
	private haloPreviewEl: HTMLDivElement | null = null;
	private haloSiteTextEl: HTMLDivElement | null = null;
	private debouncedRender = debounce(async () => {
		if (this.plugin.settings.realTimeRender) {
			await this.renderDraft();
		}
	}, 1000);
	private debouncedUpdate = debounce(async () => {
		if (this.plugin.settings.realTimeRender) {
			await this.renderDraft();
		}
	}, 1000);
	private debouncedCustomThemeChange = debounce((_theme?: string) => {
		void this.renderDraft(true);
	}, 2000);

	private draftHeader: MPArticleHeader;
	articleProperties: Map<string, string> = new Map();
	editorView: EditorView | null = null;
	lastLeaf: WorkspaceLeaf | undefined;
	renderDiv: HTMLDivElement;
	elementMap: Map<string, Node | string>;
	articleTitle: Setting;
	previewTitleEl: HTMLDivElement;
	containerDiv: HTMLElement;
	mpModal: WebViewModal;
	isActive: boolean = false;
	renderPreviewer: HTMLDivElement;
	accountDropdown: DropdownComponent;
	getViewType(): string {
		return VIEW_TYPE_ONE2MP_PREVIEW;
	}
	getDisplayText(): string {
		return $t("views.previewer.one2mp-previewer");
	}
	getIcon() {
		return "one2mp-logo";
	}
	constructor(leaf: WorkspaceLeaf, plugin: One2MpPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.wechatClient = WechatClient.getInstance(this.plugin);
	}

	async onOpen() {
		await this.ensureThemeSelector();
		this.buildUI();
		this.startListen();
		this.isActive = true;
		this.markdownView =
			ResourceManager.getInstance(this.plugin).getCurrentMarkdownView() ??
			null;
		this.scheduleInitialRender();

		this.messageUnsubscribes.push(
			this.plugin.messageService.registerListener(
				"draft-title-updated",
				(title: string) => {
					this.setPreviewTitle(title);
				}
			)
		);
		this.themeSelector?.startWatchThemes();
		this.messageUnsubscribes.push(
			this.plugin.messageService.registerListener(
				"custom-theme-changed",
				(theme: string) => {
					this.debouncedCustomThemeChange(theme);
				}
			)
		);
		this.plugin.messageService.sendMessage("active-file-changed", null);
		await this.loadComponents();
	}

	private scheduleInitialRender() {
		if (this.initialRenderScheduled) {
			return;
		}
		this.initialRenderScheduled = true;
		const run = () => {
			void this.renderDraft(true);
		};
		this.plugin.app.workspace.onLayoutReady(() => {
			const requestIdle = window.requestIdleCallback;
			if (typeof requestIdle === "function") {
				requestIdle(run, { timeout: 2000 });
			} else {
				setTimeout(run, 300);
			}
		});
	}

	private async ensureThemeSelector() {
		if (this.themeSelector) {
			return;
		}
		const { ThemeSelector } = await import("../theme/theme-selector");
		this.themeSelector = new ThemeSelector(this.plugin);
	}

	private async getThemeManager() {
		if (!this.themeManagerModule) {
			this.themeManagerModule = await import("../theme/theme-manager");
		}
		return this.themeManagerModule.ThemeManager;
	}

	getArticleProperties() {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (
			activeFile?.extension === "md" ||
			activeFile?.extension === "markdown"
		) {
			const cache = this.app.metadataCache.getCache(activeFile.path);
			const frontmatter = cache?.frontmatter;
			this.articleProperties.clear();
			if (frontmatter !== undefined && frontmatter !== null) {
				Object.keys(frontmatter).forEach((key) => {
					this.articleProperties.set(key, frontmatter[key]);
				});
			}
		}
		return this.articleProperties;
	}
	async setArticleProperties() {
		const path = this.getCurrentMarkdownFile();

		if (path && this.articleProperties.size > 0) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				throw new Error(
					$t("views.previewer.file-not-found-path", [path])
				);
			}
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				this.articleProperties.forEach((value, key) => {
					frontmatter[key] = value;
				});
			});
		}

	}

	public getCurrentMarkdownFile() {
		const currentFile = this.plugin.app.workspace.getActiveFile();
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (let leaf of leaves) {
			const markdownView = leaf.view as MarkdownView;
			if (markdownView.file?.path === currentFile?.path) {
				return markdownView.file?.path;
			}
		}
		return null;
	}
	buildUI() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("one2mp-preview-container");

		// 1. Top Toolbar
		this.buildToolbar(container as HTMLElement);

		// 2. Main Scrollable Content Area
		const mainDiv = container.createDiv({
			cls: "one2mp-main-scroll-area",
		});

		// 3. Platform Tabs
		const tabs = mainDiv.createDiv({ cls: "one2mp-platform-tabs" });
		this.buildPlatformTabs(tabs);

		// 4. Platform Panels
		const panels = mainDiv.createDiv({ cls: "one2mp-platform-panels" });
		const wechatPanel = panels.createDiv({
			cls: "one2mp-platform-panel one2mp-platform-panel-active",
		});
		this.platformPanels.set("wechat", wechatPanel);

		// 4.1 WeChat Panel Content
		this.draftHeader = new MPArticleHeader(this.plugin, wechatPanel);

		this.previewTitleEl = wechatPanel.createDiv({
			cls: "one2mp-preview-title",
		});
		this.setPreviewTitle();

		this.renderDiv = wechatPanel.createDiv({ cls: "render-container" });
		this.renderDiv.id = "render-div";
		this.renderPreviewer = wechatPanel.createDiv({
			cls: "one2mp-render-preview",
		});

		this.containerDiv = this.renderDiv.createDiv({ cls: "one2mp-article" });
		this.articleDiv = this.containerDiv.createDiv({ cls: "article-div" });

		// 4.2 RedBook Panel Content
		const redbookPanel = panels.createDiv({ cls: "one2mp-platform-panel" });
		this.platformPanels.set("redbook", redbookPanel);
		this.buildRedbookPanel(redbookPanel);

		const haloPanel = panels.createDiv({ cls: "one2mp-platform-panel" });
		this.platformPanels.set("halo", haloPanel);
		this.buildHaloPanel(haloPanel);

		this.setActivePlatform("wechat");
	}

	buildToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "one2mp-preview-toolbar" });

		// Left Group: Account Switcher
		const leftGroup = toolbar.createDiv({ cls: "toolbar-group-left" });
		this.accountDropdown = new DropdownComponent(leftGroup);
		this.updateAccountOptions();
		this.accountDropdown.onChange((value) => {
			this.plugin.settings.selectedMPAccount = value;
			this.plugin.saveSettings();
			this.plugin.messageService.sendMessage("wechat-account-changed", value);
			new Notice(`Switched to: ${value}`);
		});

		// Center Group: Spacer
		toolbar.createDiv({ cls: "toolbar-group-center" });

		// Right Group: Theme -> Actions -> IP
		const rightGroup = toolbar.createDiv({ cls: "toolbar-group-right" });

        // Container for Theme + Actions (Grouped)
        const actionsGroup = rightGroup.createDiv({ cls: "one2mp-toolbar-actions-group" });

        // 1. Theme Dropdown
        const themeDropdown = new DropdownComponent(actionsGroup);
        if (this.themeSelector) {
            void this.themeSelector.dropdown(themeDropdown);
        } else {
            themeDropdown.addOption("--default--", $t("views.theme-manager.default-theme"));
            themeDropdown.setDisabled(true);
        }

        // 2. Action Buttons
        const createBtn = (icon: string, tooltip: string, action: () => void) => {
            const btn = actionsGroup.createEl("button", { cls: "clickable-icon one2mp-toolbar-btn" });
            setIcon(btn, icon);
            btn.setAttribute("aria-label", tooltip);
            btn.onclick = action;
            return btn;
        };

        createBtn("settings", $t("views.previewer.publish-config"), () => {
            new PublishConfigModal(this.app, this.plugin).open();
        });

        createBtn("refresh-cw", $t("views.previewer.render-article"), () => {
            void this.renderDraft(true);
        });

        createBtn("clipboard-copy", $t("views.previewer.copy-article-to-clipboard"), () => {
            const data = this.getArticleContent();
            if (navigator.clipboard?.write && window.ClipboardItem) {
                void navigator.clipboard
                    .write([
                        new ClipboardItem({
                            "text/html": new Blob([data], { type: "text/html" }),
                        }),
                    ])
                    .then(() => {
                        new Notice($t("views.previewer.article-copied-to-clipboard"));
                    })
                    .catch((error) => {
                        console.warn("复制到剪贴板失败", error);
                    });
                return;
            }
            if (navigator.clipboard?.writeText) {
                void navigator.clipboard
                    .writeText(data)
                    .then(() => {
                        new Notice($t("views.previewer.article-copied-to-clipboard"));
                    })
                    .catch((error) => {
                        console.warn("复制到剪贴板失败", error);
                    });
                return;
            }
            new Notice($t("settings.clipboard-not-supported"));
        });

        createBtn("send-horizontal", $t("views.previewer.send-article-to-draft-box"), () => {
            void (async () => {
                if (await this.checkCoverImage()) {
                    void this.sendArticleToDraftBox();
                } else {
                    new Notice($t("views.previewer.please-set-cover-image"));
                }
            })();
        });

        // 3. IP Address Display
        const ipDisplay = rightGroup.createDiv({ cls: "one2mp-toolbar-ip" });
        
        const renderIps = (ips: DualIps) => {
            ipDisplay.empty();
            if (!ips.direct && !ips.proxy) {
                ipDisplay.setText("IP: ...");
                return;
            }
            
            // Helper for row
            const addRow = (label: string, type: 'direct' | 'proxy' | 'single') => {
                const r = ipDisplay.createDiv({ cls: "one2mp-ip-subrow" });
                r.createSpan({ text: label + ": ", cls: "label" });
                const ipValue = type === 'single' ? (ips.direct || ips.proxy) : (type === 'direct' ? ips.direct : ips.proxy);
                r.createSpan({ text: ipValue, cls: "value" });
                r.title = `点击刷新并复制 ${label} IP`;
                
                r.onclick = (e) => {
                    e.stopPropagation();
                    void (async () => {
                        new Notice("正在刷新 IP...");
                        try {
                            const newIps = await this.plugin.updateIpAddress();
                            renderIps(newIps); // Re-render with new data

                            const newIp = type === 'single' ? (newIps.direct || newIps.proxy) : (type === 'direct' ? newIps.direct : newIps.proxy);
                            if (newIp) {
                                if (navigator.clipboard?.writeText) {
                                    await navigator.clipboard.writeText(newIp);
                                    new Notice(`${label} IP 已刷新并复制`);
                                } else {
                                    new Notice($t("settings.clipboard-not-supported"));
                                }
                            } else {
                                new Notice("无法获取 IP");
                            }
                        } catch (err) {
                            new Notice("刷新 IP 失败");
                            console.error(err);
                        }
                    })();
                };
            };

            if (ips.direct === ips.proxy || !ips.proxy || !ips.direct) {
                addRow("IP", 'single');
            } else {
                if (ips.direct) addRow("直连", 'direct');
                if (ips.proxy) addRow("代理", 'proxy');
            }
        };

        // Load cached
        let cached: DualIps = {};
        try {
            cached = JSON.parse(this.plugin.settings.ipAddress || "{}");
        } catch (error) {
            console.debug("Failed to parse cached IP address:", error);
        }
        renderIps(cached);

        // Initial fetch (background)
        this.plugin
            .updateIpAddress()
            .then((ips) => {
                renderIps(ips);
            })
            .catch((error) => {
                console.debug("Failed to refresh IP address:", error);
            });
	}
	
	private buildPlatformTabs(container: HTMLElement) {
		const platforms: Array<{ key: PreviewPlatform; label: string }> = [
			{ key: "wechat", label: $t("views.platform.wechat") },
			{ key: "redbook", label: $t("views.platform.redbook") },
			{ key: "halo", label: $t("views.platform.halo") },
		];
		platforms.forEach((platform) => {
			const btn = container.createEl("button", {
				cls: "one2mp-platform-tab",
			});
			btn.setText(platform.label);
			btn.onclick = () => {
				this.setActivePlatform(platform.key);
			};
			this.platformTabs.set(platform.key, btn);
		});
	}

	private setActivePlatform(platform: PreviewPlatform) {
		this.currentPlatform = platform;
		this.platformTabs.forEach((tab, key) => {
			tab.classList.toggle("one2mp-platform-tab-active", key === platform);
		});
		this.platformPanels.forEach((panel, key) => {
			panel.classList.toggle(
				"one2mp-platform-panel-active",
				key === platform
			);
		});
		if (platform === "wechat") {
			void this.renderDraft(true);
			return;
		}
		if (platform === "redbook") {
			void this.renderRedbookPreview();
			return;
		}
		if (platform === "halo") {
			void this.renderHaloPreview();
		}
	}

	private buildRedbookPanel(container: HTMLElement) {
		const coverContainer = container.createDiv({ cls: "one2mp-redbook-cover" });
		coverContainer.createDiv({
			cls: "one2mp-redbook-cover-title",
			text: $t("views.redbook.cover-title"),
		});
		coverContainer.createDiv({
			cls: "one2mp-redbook-cover-hint",
			text: $t("views.redbook.cover-hint"),
		});
		this.redbookCoverFrame = coverContainer.createDiv({
			cls: "one2mp-redbook-cover-frame",
			attr: { droppable: true },
		});
		this.redbookCoverFrame.ondragenter = (event) => {
			event.preventDefault();
			this.redbookCoverFrame?.addClass("image-on-dragover");
		};
		this.redbookCoverFrame.ondragleave = (event) => {
			event.preventDefault();
			this.redbookCoverFrame?.removeClass("image-on-dragover");
		};
		this.redbookCoverFrame.ondragover = (event) => {
			event.preventDefault();
		};
		this.redbookCoverFrame.addEventListener("drop", (event) => {
			void this.handleRedbookCoverDrop(event);
		});
		this.refreshRedbookCover();

		const actions = container.createDiv({ cls: "one2mp-platform-actions" });

		const createBtn = (label: string, action: () => void) => {
			const btn = actions.createEl("button");
			btn.setText(label);
			btn.onclick = action;
			return btn;
		};

		createBtn($t("views.redbook.refresh"), () => {
			void this.renderRedbookPreview();
		});
		createBtn($t("views.redbook.copy"), () => {
			void this.copyRedbookText();
		});
		createBtn($t("views.redbook.export"), () => {
			void this.exportRedbookPackage();
		});
		createBtn($t("views.redbook.open"), () => {
			this.openUrl("https://creator.xiaohongshu.com/");
		});

		this.redbookPreviewEl = container.createDiv({
			cls: "one2mp-platform-preview",
		});
	}

		private buildHaloPanel(container: HTMLElement) {
		const info = container.createDiv({ cls: "one2mp-halo-info" });
		this.haloSiteTextEl = info.createDiv({ cls: "one2mp-halo-site" });
		this.updateHaloSiteText();
		info.createDiv({
			cls: "one2mp-halo-hint",
			text: $t("views.halo.hint"),
		});

		const actions = container.createDiv({ cls: "one2mp-platform-actions" });
		const createBtn = (label: string, action: () => void) => {
			const btn = actions.createEl("button");
			btn.setText(label);
			btn.onclick = action;
			return btn;
		};

		createBtn($t("views.halo.publish"), () => {
			void this.plugin.haloClient.publishActiveNote();
		});
		createBtn($t("views.halo.open-site"), () => {
			const site = this.getSelectedHaloSite();
			if (!site) {
				new Notice($t("views.halo.missing-site"));
				return;
			}
			this.openUrl(site.url);
		});

		this.haloPreviewEl = container.createDiv({
			cls: "one2mp-platform-preview one2mp-halo-preview",
		});
		void this.renderHaloPreview();
	}

	private async renderHaloPreview() {
		if (!this.haloPreviewEl) {
			return;
		}
		this.haloPreviewEl.empty();
		this.updateHaloSiteText();
		const site = this.getSelectedHaloSite();
		if (!site) {
			this.haloPreviewEl.createDiv({ text: $t("views.halo.missing-site") });
			return;
		}
		this.haloPreviewEl.createDiv({
			text: $t("views.halo.ready", [site.name || site.url]),
		});
	}

	private updateHaloSiteText() {
		if (!this.haloSiteTextEl) {
			return;
		}
		const site = this.getSelectedHaloSite();
		if (!site) {
			this.haloSiteTextEl.setText($t("views.halo.missing-site"));
			return;
		}
		this.haloSiteTextEl.setText($t("views.halo.current-site", [site.name || site.url]));
	}

	private getSelectedHaloSite() {
		const sites = this.plugin.settings.haloSites;
		if (!sites || sites.length === 0) {
			return null;
		}
		const selected = this.plugin.settings.selectedHaloSite;
		if (selected) {
			const hit = sites.find((site) => site.name === selected);
			if (hit) {
				return hit;
			}
		}
		return sites[0] ?? null;
	}

	private getActiveMarkdownFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			return null;
		}
		return file;
	}

	private async renderRedbookPreview() {
		if (!this.redbookPreviewEl) {
			return;
		}
		const file = this.getActiveMarkdownFile();
		this.redbookPreviewEl.empty();
		if (!file) {
			this.redbookContent = "";
			this.redbookPreviewEl.createDiv({
				text: $t("views.redbook.no-active-file"),
			});
			return;
		}
		const content = await this.app.vault.cachedRead(file);
		const result = await this.redbookParser.parse(content);
		this.redbookContent = result.text;
		this.refreshRedbookCover();
		const pre = this.redbookPreviewEl.createEl("pre", {
			cls: "one2mp-redbook-pre",
		});
		pre.setText(result.text || $t("views.redbook.empty"));
	}

	private async copyRedbookText() {
		if (!this.redbookContent.trim()) {
			new Notice($t("views.redbook.empty"));
			return;
		}
		if (!navigator.clipboard?.writeText) {
			new Notice($t("settings.clipboard-not-supported"));
			return;
		}
		try {
			await navigator.clipboard.writeText(this.redbookContent);
			new Notice($t("views.redbook.copied"));
		} catch (error) {
			console.warn("复制小红书文案失败", error);
		}
	}

	private async exportRedbookPackage() {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			new Notice($t("views.redbook.no-active-file"));
			return;
		}
		try {
			await exportRedBookPackage(this.app, file, this.redbookParser);
		} catch (error) {
			console.error("小红书素材导出失败", error);
		}
	}

	private refreshRedbookCover() {
		const ref = this.getRedbookCoverFromFrontmatter();
		this.redbookCoverRef = ref;
		const url = this.resolveRedbookCoverUrl(ref);
		this.updateRedbookCoverView(url);
	}

	private updateRedbookCoverView(url: string | null) {
		if (!this.redbookCoverFrame) {
			return;
		}
		this.redbookCoverFrame.empty();
		this.redbookCoverImageEl = null;
		if (!url) {
			this.redbookCoverFrame.createDiv({
				cls: "one2mp-redbook-cover-placeholder",
				text: $t("views.redbook.cover-empty"),
			});
			return;
		}
		this.redbookCoverImageEl = this.redbookCoverFrame.createEl("img", {
			cls: "one2mp-redbook-cover-image",
			attr: { src: url },
		});
	}

	private getRedbookCoverFromFrontmatter(): string | null {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return null;
		}
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
		if (!frontmatter) {
			return null;
		}
		const candidates = [this.redbookCoverFrontmatterKey, "小红书封面", "redbook_cover", "xhs_cover"];
		for (const key of candidates) {
			const value = frontmatter[key];
			if (typeof value == "string" && value.trim() !== "") {
				return value.trim();
			}
		}
		return null;
	}

	private resolveRedbookCoverUrl(ref: string | null): string | null {
		if (!ref || !ref.trim()) {
			return null;
		}
		const trimmed = ref.trim();
		if (trimmed.startsWith("http")) {
			return trimmed;
		}
		let path = trimmed;
		if (path.startsWith("vault:")) {
			path = path.slice("vault:".length);
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return this.app.vault.getResourcePath(file);
		}
		return null;
	}

	private async saveRedbookCoverToFrontmatter(coverRef: string | null) {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return;
		}
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (coverRef && coverRef.trim()) {
				frontmatter[this.redbookCoverFrontmatterKey] = coverRef.trim();
			} else {
				delete frontmatter[this.redbookCoverFrontmatterKey];
			}
		});
	}

	private getVaultRelativePathFromAbsolute(absPath: string): string | null {
		const adapter = this.app.vault.adapter;
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

	private async handleRedbookCoverDrop(event: DragEvent) {
		if (!this.redbookCoverFrame) {
			return;
		}
		event.preventDefault();
		this.redbookCoverFrame.removeClass("image-on-dragover");
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
		if (!url) {
			return;
		}
		let coverRef: string | null = null;
		if (url.startsWith("obsidian://")) {
			const parser = new UrlUtils(this.app);
			const filePath = parser.parseObsidianUrl(url);
			if (filePath) {
				coverRef = filePath;
			}
		} else if (url.startsWith("http")) {
			coverRef = url;
		} else if (url.startsWith("file://")) {
			const filePath = decodeURIComponent(url.replace("file://", ""));
			const vaultPath = this.getVaultRelativePathFromAbsolute(filePath);
			coverRef = vaultPath || url;
		} else {
			const file = this.app.vault.getAbstractFileByPath(url);
			if (file instanceof TFile) {
				coverRef = url;
			}
		}
		await this.saveRedbookCoverToFrontmatter(coverRef);
		this.redbookCoverRef = coverRef;
		this.updateRedbookCoverView(this.resolveRedbookCoverUrl(coverRef));
	}

	updateAccountOptions() {
		const dd = this.accountDropdown;
		dd.selectEl.empty();
		if (this.plugin.settings.mpAccounts.length === 0) {
			dd.addOption("", $t("modals.publish-config.no-account"));
		} else {
			this.plugin.settings.mpAccounts.forEach((acc) => {
				dd.addOption(acc.accountName, acc.accountName);
			});
			if (this.plugin.settings.selectedMPAccount) {
				dd.setValue(this.plugin.settings.selectedMPAccount);
			}
		}
	}

	private setPreviewTitle(title?: string) {
		if (!this.previewTitleEl) {
			return;
		}
		const fallback =
			this.app.workspace.getActiveFile()?.basename ??
			$t("views.previewer.article-title");
		const value = title && title.trim() ? title.trim() : fallback;
		this.previewTitleEl.setText(value);
		this.previewTitleEl.setAttr("title", value);
	}
	async checkCoverImage() {
		return this.draftHeader.checkCoverImage();
	}
	async sendArticleToDraftBox() {
		// 发送草稿前先应用主题与上传本地/外链资源
		const root = this.articleDiv.firstElementChild as HTMLElement | null;
		if (root) {
			const ThemeManager = await this.getThemeManager();
			if (ThemeManager) {
				await ThemeManager.getInstance(this.plugin).applyTheme(root);
			}
		}
		await uploadSVGs(this.articleDiv, this.plugin.wechatClient);
		await uploadCanvas(this.articleDiv, this.plugin.wechatClient);
		await uploadURLImage(this.articleDiv, this.plugin.wechatClient, this.app);
		await uploadURLVideo(this.articleDiv, this.plugin.wechatClient);

		const media_id = await this.wechatClient.sendArticleToDraftBox(
			this.draftHeader.getActiveLocalDraft()!,
			this.getArticleContent()
		);

		if (media_id) {
			this.draftHeader.updateDraftDraftId(media_id);
			const news_item = await this.wechatClient.getDraftById(
				this.plugin.settings.selectedMPAccount!,
				media_id
			);
			if (news_item) {
				this.openUrl(news_item[0].url);
				const item = {
					media_id: media_id,
					content: {
						news_item: news_item,
					},
					update_time: Date.now(),
				};
				this.plugin.messageService.sendMessage(
					"draft-item-updated",
					item
				);
			}
		}
	}
	public getArticleContent() {
		const root = this.articleDiv.firstElementChild as HTMLElement | null;
		const sampleText = root?.querySelector<HTMLElement>("p");
		const baseColor =
			(sampleText && window.getComputedStyle(sampleText).color) ||
			(root && window.getComputedStyle(root).color) ||
			undefined;
		const cloned = this.articleDiv.cloneNode(true) as HTMLElement;
		applyInlineCalloutTextColor(cloned, baseColor);
		return MpcardDataManager.getInstance().restoreCard(serializeChildren(cloned));
	}

	// async getCSS() {
	// 	return await ThemeManager.getInstance(this.plugin).getCSS();
	// }

	onClose(): Promise<void> {
		// Clean up our view
		this.stopListen();
		this.messageUnsubscribes.forEach((unsubscribe) => unsubscribe());
		this.messageUnsubscribes = [];
		return Promise.resolve();
	}

	async parseActiveMarkdown() {
		// 渲染当前激活的 Markdown 为微信可用的 HTML
		// get properties
		this.getArticleProperties();
		const mview =
			ResourceManager.getInstance(this.plugin).getCurrentMarkdownView() ||
			this.markdownView;
		if (!mview) {
			return $t("views.previewer.not-a-markdown-view");
		}
		this.articleDiv.empty();
		this.elementMap = new Map<string, HTMLElement | string>();
		const activeFile = mview.file ?? this.app.workspace.getActiveFile();

		if (!activeFile) {
			return `<h1>No active file</h1>`;
		}
		if (activeFile.extension !== "md") {
			return `<h1>Not a markdown file</h1>`;
		}
		await ObsidianMarkdownRenderer.getInstance(this.plugin.app).render(
			activeFile.path,
			this.renderPreviewer,
			this
		);
		let html = await WechatRender.getInstance(this.plugin, this).parseNote(
			activeFile.path
		);

		// return; //to see the render tree.
		const articleSection = createEl("section", {
			cls: "one2mp-article-content one2mp",
		});
		const dom = sanitizeHTMLToDom(html);
		articleSection.appendChild(dom);

		this.articleDiv.empty();
		this.articleDiv.appendChild(articleSection);

		for (const [id, node] of this.elementMap.entries()) {
			const item = this.articleDiv.querySelector(
				"#" + id
			) as HTMLElement | null;

			if (!item) continue;
			if (typeof node === "string") {
				const tf = ResourceManager.getInstance(this.plugin).getFileOfLink(
					node
				);
				if (tf) {
					const file = this.plugin.app.vault.getFileByPath(tf.path);
					if (file) {
						const body = await WechatRender.getInstance(
							this.plugin,
							this
						).parseNote(file.path);
						item.empty();
						item.appendChild(sanitizeHTMLToDom(body));
					}
				}
			} else {
				item.appendChild(node);
			}
		}
	}
	async renderDraft(force = false) {
		if (force) {
			this.allowRender = true;
		}
		if (!this.allowRender || !this.isViewActive()) {
			return;
		}
		if (this.currentPlatform === "redbook") {
			await this.renderRedbookPreview();
			return;
		}
		if (this.currentPlatform === "halo") {
			await this.renderHaloPreview();
			return;
		}

		await this.parseActiveMarkdown();
		if (this.articleDiv === null || this.articleDiv.firstChild === null) {
			return;
		}
		const element = this.articleDiv.firstChild as HTMLElement;
		const apply = () => {
			if (!element.isConnected) return;
			// 渲染完成后再应用主题，避免频繁重排
			void (async () => {
				const ThemeManager = await this.getThemeManager();
				if (ThemeManager) {
					await ThemeManager.getInstance(this.plugin).applyTheme(element);
				}
			})();
		};
		const requestIdle = window.requestIdleCallback;
		if (typeof requestIdle === "function") {
			requestIdle(apply);
		} else {
			setTimeout(apply, 0);
		}
	}
	isViewActive(): boolean {
		return this.isActive && !this.app.workspace.rightSplit.collapsed
	}

	startListen() {
		this.registerEvent(
			this.plugin.app.vault.on("rename", (file: TFile) => {
				this.draftHeader.onNoteRename(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const isOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_ONE2MP_PREVIEW).length > 0;
				this.isActive = isOpen;
			})
		);

		const ec = this.app.workspace.on(
			"editor-change",
			() => {
				this.onEditorChange();
			}
		);
		this.listeners.push(ec);

		const el = this.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf){
				if(leaf.view.getViewType() === "markdown") {
					this.markdownView = leaf.view as MarkdownView;
					this.lastLeaf = leaf;
					this.plugin.messageService.sendMessage(
						"active-file-changed",
						null
					);
					this.debouncedUpdate();
				}else {
					
					this.isActive = (leaf.view as unknown) === this
				}

			}
		});
		this.listeners.push(el);
	}
	stopListen() {
		this.listeners.forEach((e) => this.app.workspace.offref(e));
	}

	onEditorChange() {
		this.debouncedRender();
	}
	updateElementByID(id: string, html: string): void {
		const item = this.articleDiv.querySelector("#" + id) as HTMLElement;
		if (!item) return;
		const doc = sanitizeHTMLToDom(html);

		item.empty();
		item.appendChild(doc);
		// if (doc.childElementCount > 0) {
		// 	for (const child of doc.children) {
		// 		item.appendChild(child.cloneNode(true));
		// 	}
		// } else {
		// 	item.innerText = $t("views.previewer.article-render-failed");
		// }
	}
	addElementByID(id: string, node: HTMLElement | string): void {
		if (typeof node === "string") {
			this.elementMap.set(id, node);
		} else {
			this.elementMap.set(id, node.cloneNode(true));
		}
	}
	private async loadComponents() {
			type InternalComponent = Component & {
				_children: Component[];
				onload: () => void | Promise<void>;
			}
	
			const internalView = this as unknown as InternalComponent;
	
			// recursively call onload() on all children, depth-first
			const loadChildren = async (
				component: Component,
				visited: Set<Component> = new Set()
			): Promise<void> => {
				if (visited.has(component)) {
					return;  // Skip if already visited
				}
	
				visited.add(component);
	
				const internalComponent = component as InternalComponent;
	
				if (internalComponent._children?.length) {
					for (const child of internalComponent._children) {
						await loadChildren(child, visited);
					}
				}
				try {
						// relies on the Sheet plugin (advanced-table-xt) not to be minified
						if (component?.constructor?.name === 'SheetElement') {
							const result = component.onload();
							const maybePromise = result as Promise<void> | undefined;
							if (maybePromise && typeof maybePromise.then === "function") {
								await maybePromise;
							}
						}
				} catch (error) {
					console.error(`Error calling onload()`, error);
				}
			};
			await loadChildren(internalView);
		}

	private openUrl(url: string) {
		if (!url) {
			return;
		}
		if (typeof window !== "undefined" && typeof window.open === "function") {
			window.open(url);
			return;
		}
		const appAny = this.app as unknown as { openWithDefaultApp?: (path: string) => void };
		if (appAny.openWithDefaultApp) {
			appAny.openWithDefaultApp(url);
			return;
		}
		new Notice($t("views.previewer.open-url-not-supported"));
	}
}
