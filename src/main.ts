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
	Notice,
	Plugin,
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
import { initDraftDB, LocalDraftManager } from "./assets/draft-manager";
import { MessageService } from "./utils/message-service";
import { PreviewPanel, VIEW_TYPE_ONE2MP_PREVIEW } from "./views/previewer";
import { WechatClient } from "./wechat-api/wechat-client";
import { Spinner } from "./views/spinner";
import { MpcardInsertModal } from "./modals/mpcard-insert-modal";
import { ThemeManager } from "./theme/theme-manager";
import { WechatRender } from "./render/wechat-render";

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
	private editorChangeListener: EventRef | null = null;
	messageService: MessageService;
	resourceManager = ResourceManager.getInstance(this);
	active: boolean = false;
	spinner: Spinner;

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
			.find((leaf) => leaf.view instanceof PreviewPanel);

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
		initOne2MpDB();
		initDraftDB();
	}
	async onload() {
		// 插件入口：初始化 -> 读取配置 -> 注册视图与命令
		this.initDB();
		this.messageService = new MessageService();
		await this.loadSettings();
		this.wechatClient = WechatClient.getInstance(this);
		addIcon(ONE2MP_ICON_ID, ONE2MP_ICON_SVG);

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
				
				this.registerView(viewType, (leaf) => new PreviewPanel(leaf, this))
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
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof PreviewPanel) {
				leaf.detach();
			}
		});
		this.app.workspace.getLeavesOfType(VIEW_TYPE_ONE2MP_PREVIEW).forEach((leaf) => leaf.detach());
		WechatClient.resetInstance();
		ThemeManager.resetInstance();
		LocalDraftManager.resetInstance();
		WechatRender.resetInstance();
	}




}
