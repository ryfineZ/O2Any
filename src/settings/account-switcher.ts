/**
 * Support for WeChat MP Account selection
 */
import { Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import One2MpPlugin from "src/main";

export class WeChatMPAccountSwitcher extends Setting {
    private plugin: One2MpPlugin;
    constructor(plugin: One2MpPlugin, containerEl: HTMLElement) {
        super(containerEl);
        this.plugin = plugin;
        this.setName($t('settings.select-wechat-mp-account'))
        .addDropdown((dropdown) => {
            this.plugin.settings.mpAccounts.forEach(account => {
                dropdown.addOption(account.accountName, account.accountName)
            })
            dropdown.setValue(this.plugin.settings.selectedMPAccount ?? $t('settings.select-wechat-mp-account'))
						.onChange((value) => {
							// this.plugin.onWeChantMPAccountChange(value)
                            this.plugin.messageService.sendMessage('wechat-account-changed', value)
                            this.plugin.saveSettings()
						});
        });
    }
}
