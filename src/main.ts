/**
 * one2mp plugin for Obsidian
 * author: Learner Chen.
 * latest update: 2025-01-24
 */
import {
	addIcon,
	debounce,
	Editor,
	EventRef,
	ItemView,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { getDualIps, DualIps } from "src/utils/ip-address";
import { ResourceManager } from "./assets/resource-manager";
import { $t } from "./lang/i18n";
import { ConfirmModal } from "./modals/confirm-modal";
import { One2MpSettingTab } from "./settings/setting-tab";
import {
	getOne2MpSetting,
	saveOne2MpSetting,
	One2MpSetting,
	initOne2MpDB
} from "./settings/one2mp-setting";
import { initDraftDB } from "./assets/draft-manager";
import { MessageService } from "./utils/message-service";
const VIEW_TYPE_ONE2MP_PREVIEW = "one2mp-article-preview";
import { WechatClient } from "./wechat-api/wechat-client";
import { HaloClient } from "./platforms/halo/halo-client";
import { Spinner } from "./views/spinner";
import { MpcardInsertModal } from "./modals/mpcard-insert-modal";

// 插件默认配置，缺失字段时用于兜底
const DEFAULT_SETTINGS: One2MpSetting = {
	mpAccounts: [],
	ipAddress: "",
	css_styles_folder: "one2mp-css-styles",
	codeLineNumber: true,
	accountDataPath: "one2mp-accounts",
	useCenterToken: false,
	realTimeRender: true,
	defaultMpcard: "",
	defaultMpcardId: "",
	defaultMpcardHeadimg: "",
	defaultMpcardNickname: "",
	defaultMpcardSignature: "",
	themeDownloadOverwrite: false,
	haloSites: [],
	selectedHaloSite: "",
	haloPublishByDefault: true,
};
const ONE2MP_ICON_ID = "one2mp-logo";
const ONE2MP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
	<path d="M 15.560304092607304 33.94050605385342C 29.693661897802365 -1.1141138324752404 70.30633810219763 -1.1141138324752404 84.43969590739269 33.940506053853426C 51.84603073656342 45.353262378865885 48.15396926343658 45.353262378865885 15.560304092607304 33.94050605385342Z" fill="#84D473" />
	<path d="M 81.12777768298169 28.204095418660252C 104.41929012195195 57.97125226189857 84.1129520197543 93.14286157057666 46.688081775588984 87.85539852748633C 53.1011774563413 53.92207832459788 54.947208192904725 50.72465929653623 81.12777768298169 28.204095418660252Z" fill="#3AB54A" />
	<path d="M 53.31191822441101 87.85539852748633C 15.887047980245676 93.14286157057666 -4.419290121951946 57.971252261898584 18.872222317018313 28.204095418660245Q 45.052791807095275 50.72465929653624 28.163984663890915 52.681125554913244L 38.40889008453118 53.10582854123025L 29.748893224046313 58.59608482676403Q 46.898822543658696 53.92207832459788 53.31191822441101 87.85539852748633Z" fill="#27753D" />
</svg>`;

export default class One2MpPlugin extends Plugin {
	settings: One2MpSetting;
	wechatClient: WechatClient;
	haloClient: HaloClient;
	private editorChangeListener: EventRef | null = null;
	messageService: MessageService;
	resourceManager = ResourceManager.getInstance(this);
	active: boolean = false;
	spinner: Spinner;
	private previewPanelCtor: (new (
		leaf: WorkspaceLeaf,
		plugin: One2MpPlugin
	) => ItemView) | null = null;
	private readonly notePathKey = "笔记路径";
	private updateNotePathDebounced: ((file: TFile | null) => void) | null = null;

	private async updateNotePathFrontmatter(file: TFile | null) {
		if (!file || file.extension !== "md") {
			return;
		}
		const notePath = file.path;
		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				if (frontmatter[this.notePathKey] !== notePath) {
					frontmatter[this.notePathKey] = notePath;
				}
			});
		} catch (error) {
			console.warn("更新笔记路径失败", error);
		}
	}

	async saveThemeFolder() {
		this.trimSettings();
		const settings = { ...this.settings };
		delete settings._id;
		delete settings._rev;
		const config = {
			custom_theme_folder: this.settings.css_styles_folder,
		};
		const data = (await this.loadData()) as Record<string, unknown> | null;
		await this.saveData({
			...(data ?? {}),
			...config,
			settings: settings,
		});
		this.messageService.sendMessage("custom-theme-folder-changed", null);
	}
	async loadThemeFolder() {
		const config = await this.loadData();
		if (config && config.custom_theme_folder) {
			this.settings.css_styles_folder = config.custom_theme_folder;
		}
	}
	// private spinnerEl: HTMLElement;
	// spinnerText: HTMLDivElement;
	trimSettings() {
		this.settings.mpAccounts.forEach((account) => {
			account.accountName = account.accountName.trim();
			account.appId = account.appId.trim();
			account.appSecret = account.appSecret.trim();
		});
		this.settings.haloSites.forEach((site) => {
			site.name = site.name.trim();
			site.url = site.url.trim();
			site.token = site.token.trim();
		});
		this.settings.selectedHaloSite = this.settings.selectedHaloSite?.trim();
		this.settings.ipAddress = this.settings.ipAddress?.trim();
		this.settings.selectedMPAccount = this.settings.selectedMPAccount?.trim();
		this.settings.accountDataPath = this.settings.accountDataPath?.trim();
		this.settings.css_styles_folder = this.settings.css_styles_folder?.trim();
	}
	// 使用防抖减少频繁写入本地数据库
	saveSettings: () => void = debounce(async () => {
		delete this.settings._id;
		delete this.settings._rev;
		this.trimSettings();
		await saveOne2MpSetting(this, this.settings);
		await this.saveThemeFolder();
	}, 3000);
	saveThemeFolderDebounce: () => void = debounce(async () => {
		await this.saveThemeFolder();
	}, 3000);

	// proofService: ProofService;
	// 启动日志写入，便于移动端定位加载失败原因
	private async writeStartupLog(message: string, error?: unknown) {
		const path = "o2any-startup.log";
		const time = new Date().toISOString();
		const detail = error ? ` ${this.formatStartupError(error)}` : "";
		const line = `[${time}] ${message}${detail}\n`;
		try {
			const adapter = this.app.vault.adapter;
			const exists = await adapter.exists(path);
			if (exists) {
				await adapter.append(path, line);
			} else {
				await adapter.write(path, line);
			}
		} catch (writeError) {
			console.error("O2Any 启动日志写入失败", writeError);
		}
	}

	private formatStartupError(error: unknown) {
		if (error instanceof Error) {
			return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
		}
		return String(error);
	}

	createSpinner() {

		this.spinner = new Spinner(this.addStatusBarItem());
	}
	showSpinner(text: string = "") {
		this.spinner.showSpinner(text);

	}
	isSpinning() {
		return this.spinner.isSpinning();
	}

	hideSpinner() {
		this.spinner.hideSpinner();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await getOne2MpSetting(this)
		);
		await this.loadThemeFolder();
	}
	async updateIpAddress(): Promise<DualIps> {
		try {
			const ips = await getDualIps();
			// Store as JSON string for persistence if needed, or just cache in memory
            // But settings.ipAddress is string.
			this.settings.ipAddress = JSON.stringify(ips);
			this.saveSettings();
			return ips;
		} catch (error) {
			console.error("Error fetching public IP address:", error);
			return {};
		}
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null | undefined = workspace
			.getLeavesOfType(VIEW_TYPE_ONE2MP_PREVIEW)
			.find((leaf) => leaf.view.getViewType() === VIEW_TYPE_ONE2MP_PREVIEW);

		if (leaf === undefined || leaf === null) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({
				type: VIEW_TYPE_ONE2MP_PREVIEW,
				active: true,
			});
		}
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
	getAccessToken(accountName: string) {
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			new Notice($t("main.no-wechat-mp-account-selected"));
			return false;
		}
		return account.access_token;
	}
	async TestAccessToken(accountName: string) {
		if (this.settings.useCenterToken) {
			return this.wechatClient.requestToken();
		} else {
			const account = this.getMPAccountByName(accountName);
			if (account === undefined) {
				new Notice($t("main.no-wechat-mp-account-selected"));
				return false;
			}
			const token = await this.wechatClient.getAccessToken(
				account.appId,
				account.appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in
				);
				return token.access_token;
			}
		}
		return false;
	}
	async refreshAccessToken(accountName: string | undefined) {
		if (this.settings.useCenterToken) {
			return this.wechatClient.requestToken();
		}
		if (accountName === undefined) {
			return false;
		}
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			new Notice($t("main.no-wechat-mp-account-selected"));
			return false;
		}
		const { appId, appSecret } = account;
		if (
			appId === undefined ||
			appSecret === undefined ||
			!appId ||
			!appSecret
		) {
			new Notice($t("main.please-check-you-appid-and-appsecret"));
			return false;
		}
		const {
			access_token: accessToken,
			expires_in: expiresIn,
			lastRefreshTime,
		} = account;
		if (accessToken === undefined || accessToken === "") {
			const token = await this.wechatClient.getAccessToken(
				appId,
				appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in
				);
				return token.access_token;
			}
		} else if (
			lastRefreshTime! + expiresIn! * 1000 <
			new Date().getTime()
		) {
			const token = await this.wechatClient.getAccessToken(
				appId,
				appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in
				);
				return token.access_token;
			}
		} else {
			return accessToken;
		}
		return false;
	}
	getMPAccountByName(accountName: string | undefined) {
		return this.settings.mpAccounts.find(
			(account) => account.accountName === accountName
		);
	}
	getSelectedMPAccount() {
		return this.getMPAccountByName(this.settings.selectedMPAccount);
	}
	setAccessToken(
		accountName: string,
		accessToken: string,
		expires_in: number
	) {
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			return;
		}
		account.access_token = accessToken;
		account.lastRefreshTime = new Date().getTime();
		account.expires_in = expires_in;
		this.saveSettings();
	}
	confirm(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmModal(this.app, message, resolve);
			modal.open();
		});
	}
	// 初始化本地数据库（设置与草稿）
	initDB() {
		void initOne2MpDB();
		void initDraftDB();
	}
	async onload() {
		// 插件入口：初始化 -> 读取配置 -> 注册视图与命令
		await this.writeStartupLog("onload:start");
		try {
			this.initDB();
			this.messageService = new MessageService();
			await this.loadSettings();
			this.wechatClient = WechatClient.getInstance(this);
			this.haloClient = new HaloClient(this);
			addIcon(ONE2MP_ICON_ID, ONE2MP_ICON_SVG);

			const previewModule = await import("./views/previewer");
			this.previewPanelCtor = previewModule.PreviewPanel;
			this.registerViews();

			this.addCommand({
				id: "open-previewer",
				name: $t("main.open-previewer"),
				callback: () => {
					void this.activateView();
				},
			});
			this.addRibbonIcon(ONE2MP_ICON_ID, $t("main.open-previewer"), () => {
				void this.activateView();
			});

			this.addSettingTab(new One2MpSettingTab(this.app, this));

			this.updateNotePathDebounced = debounce(
				(file: TFile | null) => {
					void this.updateNotePathFrontmatter(file);
				},
				200
			);
			this.registerEvent(
				this.app.workspace.on("file-open", (file) => {
					if (this.updateNotePathDebounced) {
						this.updateNotePathDebounced(file);
					}
				})
			);
			this.registerEvent(
				this.app.vault.on("rename", (file) => {
					if (file instanceof TFile && this.updateNotePathDebounced) {
						this.updateNotePathDebounced(file);
					}
				})
			);

			this.createSpinner();

			// -- proofread
			// this.registerEditorExtension([proofreadStateField, proofreadPlugin]);

			// this.addCommand({
			// 	id: "proofread-text",
			// 	name: "校对文本",
			// 	editorCallback: async (editor: Editor, view: MarkdownView) => {
			// 		await proofreadText(editor, view);
			// 	},
			// });
			this.messageService.registerListener('show-spinner', (msg: string) => {
				this.showSpinner(msg);
			})
			this.messageService.registerListener('hide-spinner', () => {
				this.hideSpinner();
			})

			this.registerEvent(
				this.app.workspace.on("editor-menu", (menu, editor: Editor) => {
					menu.addItem((item) => {
						item.setTitle($t("main.insert-mpcard"));
						item.onClick(() => {
							const initial =
								this.settings.defaultMpcard ||
								this.buildDefaultMpcard();
							const modal = new MpcardInsertModal(
								this.app,
								(content) => {
									editor.replaceSelection(content);
								},
								initial
							);
							modal.open();
						});
					});
				})
			);
		} catch (error) {
			await this.writeStartupLog("onload:error", error);
			throw error;
		}
		await this.writeStartupLog("onload:ready");
	}

	private buildDefaultMpcard() {
		const lines: string[] = [];
		const id = this.settings.defaultMpcardId?.trim();
		const headimg = this.settings.defaultMpcardHeadimg?.trim();
		const nickname = this.settings.defaultMpcardNickname?.trim();
		const signature = this.settings.defaultMpcardSignature?.trim();
		if (id) lines.push(`id: ${id}`);
		if (headimg) lines.push(`headimg: ${headimg}`);
		if (nickname) lines.push(`nickname: ${nickname}`);
		if (signature) lines.push(`signature: ${signature}`);
		if (lines.length === 0) {
			return "";
		}
		return ["```mpcard", ...lines, "```"].join("\n");
	}
	registerViewOnce(viewType: string) {
		if (this.app.workspace.getLeavesOfType(viewType).length === 0) {
			if (viewType === VIEW_TYPE_ONE2MP_PREVIEW) {
				if (!this.previewPanelCtor) {
					new Notice("预览器未加载，无法注册视图");
					return;
				}
				this.registerView(viewType, (leaf) => new this.previewPanelCtor!(leaf, this));
			}
		}
	}
	registerViews() {
		this.registerViewOnce(VIEW_TYPE_ONE2MP_PREVIEW);
	}

	onunload() {
		if (this.editorChangeListener) {
			this.app.workspace.offref(this.editorChangeListener);
		}
		// this.spinnerEl.remove();
		this.spinner.unload();
		this.app.workspace.getLeavesOfType(VIEW_TYPE_ONE2MP_PREVIEW).forEach((leaf) => leaf.detach());
		WechatClient.resetInstance();
		void (async () => {
			const { ThemeManager } = await import("./theme/theme-manager");
			ThemeManager.resetInstance();
		})();
		void (async () => {
			const { LocalDraftManager } = await import("./assets/draft-manager");
			LocalDraftManager.resetInstance();
			const { WechatRender } = await import("./render/wechat-render");
			WechatRender.resetInstance();
		})();
	}




}
