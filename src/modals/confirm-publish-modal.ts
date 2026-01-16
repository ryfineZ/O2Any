/**
 * a dialog modal to confirm the publish action
 * 
*/

import { Modal, Notice } from 'obsidian';
import One2MpPlugin from 'src/main';
import { DraftItem } from './../wechat-api/wechat-types';
import { $t } from 'src/lang/i18n';

export class ConfirmPublishModal extends Modal {
    plugin: One2MpPlugin;
    draftItem: DraftItem;
    constructor(plugin: One2MpPlugin, draftItem: DraftItem) {
        super(plugin.app);
        this.plugin = plugin;
        this.draftItem = draftItem
    }

    update(item: DraftItem) {
        this.draftItem = item
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('confirm-pulbish-dialog-content')

        contentEl.createEl('h3', { text: $t('modals.publish.title') });
        const content = contentEl.createDiv({ cls: 'description' })
        content.createEl('p', { text: $t('modals.publish.message') });
        content.createEl('p', { text: $t('modals.publish.warning') });
        content.createEl('p', { text: $t('modals.caution') });
        
        const toolbar = contentEl.createDiv({ cls: 'confirm-pulbish-dialog-tool-bar' })
        const confirmButton = toolbar.createEl('button', { text: $t('modals.confirm'), cls: "danger-button" });
        const cancelButton = toolbar.createEl('button', { text: $t('modals.cancel') });

        confirmButton.addEventListener('click', () => {
            this.publish();
            this.close();
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
    publish() {
        const id = this.draftItem.media_id
        if (id !== undefined && id) {
            void this.plugin.wechatClient.publishDraft(id)
                .then(() => {
                    new Notice($t('modals.publish.success'));
                })
                .catch(() => {
                    new Notice($t('modals.publish.failed'));
                })
        }
    }
}
