/**
 * tab for setting
 */

import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	Platform,
	Modal,
	TextComponent,
	ButtonComponent,
	TFile,
} from "obsidian";
import One2MpPlugin from "src/main";
import type { ThemeManager } from "src/theme/theme-manager";
import { $t } from "src/lang/i18n";
import { FolderSuggest } from "src/utils/folder-suggest";
import { FileSuggest } from "src/utils/file-suggest";
import {
	WeChatAccountInfo,
	One2MpSetting,
} from "./one2mp-setting";
import { DualIps } from "src/utils/ip-address";

interface FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
	getFile(): Promise<File>;
	queryPermission(options: {
		mode: "read" | "readwrite";
	}): Promise<"granted" | "denied">;
}

interface FileSystemDirectoryHandle {
	getFileHandle(
		name: string,
		options?: { create?: boolean }
	): Promise<FileSystemFileHandle>;
	queryPermission(options: {
		mode: "read" | "readwrite";
	}): Promise<"granted" | "denied">;
}

declare global {
	interface Window {
		showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
		showSaveFilePicker(
			options?: SaveFilePickerOptions
		): Promise<FileSystemFileHandle>;
	}
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: FilePickerAcceptType[];
}

interface FilePickerAcceptType {
	description: string;
	accept: Record<string, string[]>;
}

export class One2MpSettingTab extends PluginSettingTab {
	private plugin: One2MpPlugin;

	constructor(app: App, plugin: One2MpPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.addClass("one2mp-settings");

		// 1. 公众号账号管理区域
		this.createAccountManagement(containerEl);

		// 2. 通用设置区域
		this.createGeneralSettings(containerEl);
        
        // 3. 自定义主题
        this.creatCSSStyleSetting(containerEl);

		// 4. 备份与还原
		this.createBackupRestore(containerEl);
	}

	createAccountManagement(container: HTMLElement) {
		new Setting(container)
			.setName($t("settings.wechat-account"))
			.setHeading()
			.addExtraButton((button) => {
				button
					.setIcon("plus")
					.setTooltip($t("settings.create-new-account"))
					.onClick(() => {
						this.createNewAccount();
					});
			});

        const guide = container.createDiv({ cls: "one2mp-appid-guide" });
        guide.createEl("span", {
            text: $t("settings.appid-secret-guide") + " ",
            cls: "setting-item-description"
        });
        guide.createEl("a", {
            href: "https://developers.weixin.qq.com/console/",
            text: $t("settings.appid-secret-guide-link"),
        }).setAttr("target", "_blank");


		if (this.plugin.settings.mpAccounts.length === 0) {
            // 如果没有账号，提示创建
            const noAccountDiv = container.createDiv({ cls: "one2mp-no-account" });
            noAccountDiv.createEl("p", { text: $t("settings.select-account") }); // reusing translation key broadly
		} else {
			this.plugin.settings.mpAccounts.forEach((account, index) => {
				this.renderAccountItem(container, account, index);
			});
		}
	}

	renderAccountItem(container: HTMLElement, account: WeChatAccountInfo, index: number) {
		const accountContainer = container.createDiv({ cls: "one2mp-account-item" });
        // 使用 details 折叠每个账号详情，避免页面太长
        const details = accountContainer.createEl("details");
        // 默认展开第一个账号，或者如果是刚添加的
        if (index === 0) details.open = true;

        const summary = details.createEl("summary");
        summary.setText(account.accountName || $t("settings.new-account"));

        const content = details.createDiv({ cls: "one2mp-account-details" });

		// Account Name
		new Setting(content)
			.setName($t("settings.account-name"))
            .setDesc($t("settings.account-name-for-your-wechat-official"))
            .setClass("one2mp-setting-wide")
			.addText((text) =>
				text
					.setValue(account.accountName)
					.onChange((value) => {
						account.accountName = value;
                        summary.setText(value); // 更新 summary 标题
                        // 如果改的是当前选中的账号，更新 selectedMPAccount
                        if (this.plugin.settings.selectedMPAccount === this.plugin.settings.mpAccounts[index].accountName) {
                             this.plugin.settings.selectedMPAccount = value;
                        }
						this.plugin.saveSettings();
					})
			);

		// AppID
		new Setting(content)
			.setName($t("settings.appid"))
            .setDesc($t("settings.appid-for-your-wechat-official-account"))
            .setClass("one2mp-setting-wide")
			.addText((text) =>
				text
					.setValue(account.appId)
                    .setPlaceholder("wx...")
					.onChange((value) => {
						account.appId = value.trim();
						this.plugin.saveSettings();
					})
			);

		// AppSecret
		new Setting(content)
			.setName($t("settings.app-secret"))
            .setDesc($t("settings.app-secret-for-your-wechat-official"))
            .setClass("one2mp-setting-wide")
			.addText((text) =>
				text
					.setValue(account.appSecret)
                    .setPlaceholder("...")
					.onChange((value) => {
						const cleaned = value.replace(/\s+/g, "");
                        if (cleaned !== value) text.setValue(cleaned);
						account.appSecret = cleaned;
						this.plugin.saveSettings();
					})
			);

        // Actions: Test & Delete
        const actionSetting = new Setting(content)
            .setName(""); // Clear name as buttons have text

        actionSetting.addButton((button) => {
                button
                    .setTooltip($t("settings.click-to-connect-wechat-server"))
                    .setIcon("plug-zap")
                    .setButtonText($t("settings.test-connection"))
                    .onClick(() => {
                        void (async () => {
                            const success = await this.plugin.TestAccessToken(
                                account.accountName
                            );
                            if (success) {
                                new Notice($t("settings.successfully-connected-to-wechat-server"));
                            } else {
                                new Notice($t("settings.failed-to-connect-to-wechat-server"));
                            }
                        })();
                    });
            });
            
        actionSetting.addButton((button) => {
            button
                .setTooltip($t("settings.delete-account"))
                .setIcon("trash-2")
                .setButtonText($t("settings.delete-account"))
                .setClass("mod-warning") // Obsidian standard warning class
                .onClick(() => {
                     // Confirm deletion logic could go here
                     this.plugin.settings.mpAccounts.splice(index, 1);
                     
                     // Reset selected account if we deleted the active one
                     if (this.plugin.settings.selectedMPAccount === account.accountName) {
                         this.plugin.settings.selectedMPAccount = this.plugin.settings.mpAccounts[0]?.accountName;
                     }
                     
                     this.plugin.saveSettings();
                     this.display(); // Refresh UI
                });
        });
	}

	createNewAccount() {
		let n = 1;
		let newName = $t("settings.new-account");
		while (this.plugin.settings.mpAccounts.some(acc => acc.accountName === newName)) {
            n++;
			newName = `${$t("settings.new-account")} ${n}`;
		}

		const newAccount: WeChatAccountInfo = {
			accountName: newName,
			appId: "",
			appSecret: "",
		};
		this.plugin.settings.mpAccounts.push(newAccount);
        if (!this.plugin.settings.selectedMPAccount) {
            this.plugin.settings.selectedMPAccount = newName;
        }
		this.plugin.saveSettings();
		this.display();
	}

	createGeneralSettings(container: HTMLElement) {
		new Setting(container)
			.setName($t("settings.general-settings"))
			.setHeading();

		// IP Address
		const ipSetting = new Setting(container)
			.setName($t("settings.public-ip-address"))
			.setDesc($t("settings.you-should-add-this-ip-to-ip-whitelist-o"));
        
        const updateIpDisplay = (ips: DualIps) => {
             ipSetting.controlEl.empty();
             ipSetting.controlEl.addClass("one2mp-ip-container");
             
             // Helper to create an IP row
             const createIpRow = (label: string, ip: string | undefined) => {
                 if (!ip) return;
                 const row = ipSetting.controlEl.createDiv({ cls: "one2mp-ip-row" });
                 row.createSpan({ cls: "one2mp-ip-label", text: label });
                 row.createSpan({ cls: "one2mp-ip-value", text: ip });
                 row.title = $t("settings.copy-ip-to-clipboard");
                 row.onclick = () => {
                     if (!navigator.clipboard?.writeText) {
                         new Notice($t("settings.clipboard-not-supported"));
                         return;
                     }
                     void navigator.clipboard
                         .writeText(ip)
                         .then(() => {
                             new Notice($t("settings.ip-copied-to-clipboard"));
                         })
                         .catch((error) => {
                             console.warn("复制 IP 失败", error);
                         });
                 };
             };

             if (!ips.direct && !ips.proxy) {
                 ipSetting.controlEl.createSpan({ text: $t("settings.no-ip-address"), cls: "text-muted" });
                 return;
             }

             if (ips.direct === ips.proxy || !ips.proxy || !ips.direct) {
                 // Only show one if same or one is missing
                 createIpRow("公网 IP", ips.direct || ips.proxy);
             } else {
                 createIpRow("直连", ips.direct);
                 createIpRow("代理", ips.proxy);
             }
        };

        const loadAndDisplay = () => {
             let storedIps: DualIps = {};
             try {
                 storedIps = JSON.parse(this.plugin.settings.ipAddress || "{}");
             } catch (e) {
                 // Fallback for legacy string format or empty
                 storedIps = { direct: this.plugin.settings.ipAddress }; 
             }
             updateIpDisplay(storedIps);
        }

        // Initial display from cache
        loadAndDisplay();
        
        // Fetch fresh
		this.plugin
			.updateIpAddress()
			.then((ips) => {
				updateIpDisplay(ips);
			})
			.catch(() => {
				// 保留旧的 IP 显示即可
			});

		// Real-time Render
		new Setting(container)
			.setName($t("settings.real-time-render"))
			.setDesc($t("settings.enable-real-time-rendering"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.realTimeRender)
					.onChange((value) => {
						this.plugin.settings.realTimeRender = value;
						this.plugin.saveSettings();
					});
			});
	}

	creatCSSStyleSetting(container: HTMLElement) {
		// const frame = container.createDiv();
		new Setting(container).setName($t('settings.custom-themes')).setHeading();

		new Setting(container)
			.setName($t("settings.custom-themes-folder"))
			.setDesc($t("settings.the-folder-where-your-custom-themes"))
			.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);
				cb.setPlaceholder($t("settings.themes-folder-path"))
					.setValue(this.plugin.settings.css_styles_folder)
					.onChange((new_folder) => {
						this.plugin.settings.css_styles_folder = new_folder;
						this.plugin.saveThemeFolderDebounce();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("download")
					.setTooltip(
						$t("views.theme-manager.download-predefined-custom-themes")
					)
					.onClick(() => {
						void (async () => {
							const { ThemeManager } = await import(
								"src/theme/theme-manager"
							);
							new Notice($t("views.theme-manager.download-started"));
							void ThemeManager.getInstance(this.plugin).downloadThemes();
						})();
					});
			});

		new Setting(container)
			.setName($t("settings.theme-download-overwrite"))
			.setDesc($t("settings.theme-download-overwrite-desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.themeDownloadOverwrite)
					.onChange((value) => {
						this.plugin.settings.themeDownloadOverwrite = value;
						this.plugin.saveSettings();
					});
			});
	}

	createBackupRestore(container: HTMLElement) {
		new Setting(container)
			.setName($t("settings.import-export-one2mp-account"))
			.setHeading()
			.setDesc($t("settings.import-or-export-your-account-info-for-b"))
			.addExtraButton((button) => {
				button
					.setIcon("upload")
					.setTooltip($t("settings.import-account-info"))
					.onClick(() => {
						void this.importSettings();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("download")
					.setTooltip($t("settings.export-account-info"))
					.onClick(() => {
						void this.exportSettings();
					});
			});
	}

	async exportSettings() {
		try {
			const settingData = JSON.stringify(this.plugin.settings, null, 2);
			if (!window.showSaveFilePicker || Platform.isMobile) {
				const date = new Date().toISOString().slice(0, 10);
				const folder = "one2mp-settings";
				const filename = `one2mp-settings-${date}.json`;
				const path = `${folder}/${filename}`;
				if (!this.app.vault.getAbstractFileByPath(folder)) {
					await this.app.vault.createFolder(folder);
				}
				await this.app.vault.adapter.write(path, settingData);
				new Notice(
					$t("settings.settings-exported-to-vault", [path])
				);
				return true;
			}

			const blob = new Blob([settingData], { type: "application/json" });
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: `one2mp-settings-${new Date()
					.toISOString()
					.slice(0, 10)}.json`,
				types: [
					{
						description: "JSON Files",
						accept: { "application/json": [".json"] },
					},
				],
			});

			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			new Notice($t("settings.settings-exported"));
			return true;
		} catch (error: unknown) {
			if (error instanceof Error && error.name === "AbortError") {
				return false;
			}
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`${$t("settings.settings-exporting-failed")}${message}`);
			console.error(error);
			return false;
		}
	}

	private async importSettingsFromVault() {
		const modal = new Modal(this.app);
		modal.contentEl.createEl("h3", {
			text: $t("settings.import-settings-title"),
		});
		modal.contentEl.createEl("p", {
			text: $t("settings.import-settings-hint"),
		});

		const input = new TextComponent(modal.contentEl);
		input.setPlaceholder($t("settings.import-settings-placeholder"));
		new FileSuggest(this.app, input.inputEl, ["json"]);

		const buttons = modal.contentEl.createDiv({
			cls: "modal-button-container",
		});
		const cancelButton = new ButtonComponent(buttons);
		cancelButton.setButtonText($t("settings.cancel"));
		cancelButton.onClick(() => modal.close());

		const confirmButton = new ButtonComponent(buttons);
		confirmButton.setButtonText($t("settings.import-settings-confirm"));
		confirmButton.setCta();
		confirmButton.onClick(async () => {
			const path = input.getValue().trim();
			if (!path) {
				new Notice($t("settings.import-settings-empty-path"));
				return;
			}
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				new Notice($t("settings.import-settings-file-not-found"));
				return;
			}
			try {
				const content = await this.app.vault.read(file);
				await this.applyImportedSettings(content);
				modal.close();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`${$t("settings.settings-imported-failed")}${message}`);
				console.error(error);
			}
		});

		modal.open();
	}

	private async applyImportedSettings(content: string) {
		let importedData: One2MpSetting;
		try {
			importedData = JSON.parse(content);
		} catch (_error) {
			new Notice($t("settings.invalid-json-file"));
			return;
		}

		const { mpAccounts, css_styles_folder } = importedData;
		if (mpAccounts === undefined || css_styles_folder === undefined) {
			new Notice($t("settings.invalid-wewerite-settings-file"));
			return;
		}
		this.plugin.settings = importedData;
		this.plugin.saveSettings();
		this.display(); // Refresh UI
		new Notice($t("settings.settings-imported-successfully"));
	}

	importSettings() {
		try {
			if (Platform.isMobile) {
				void this.importSettingsFromVault();
				return;
			}
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".json";

			input.onchange = (event) => {
				const run = () => {
					const file = (event.target as HTMLInputElement).files?.[0];
					if (!file) return;

					const reader = new FileReader();
					reader.onload = (loadEvent) => {
						void (async () => {
							try {
								const content = loadEvent.target?.result as string;
								await this.applyImportedSettings(content);
							} catch (error) {
								const message =
									error instanceof Error
										? error.message
										: String(error);
								new Notice(
									`${$t("settings.settings-imported-failed")}${message}`
								);
								console.error(error);
							}
						})();
					};

					reader.readAsText(file);
				};

				void run();
			};

			input.click();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`${$t("settings.settings-imported-error")}${message}`);
			console.error(error);
		}
	}
}
