import { App, Modal } from 'obsidian';

export class WebViewModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;

        const iframe = createEl('iframe', {cls:'one2mp-webview-iframe'});

        iframe.src = 'https://mp.weixin.qq.com/'; 
        contentEl.appendChild(iframe);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
