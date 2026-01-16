import { App, Modal } from "obsidian";
import { $t } from "src/lang/i18n";

export class ConfirmModal extends Modal {
	private resolve: (value: boolean) => void;

	constructor(
		app: App,
		private message: string,
		resolve: (value: boolean) => void
	) {
		super(app);
		this.resolve = resolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv('modal-button-container');
		buttonContainer.createEl('button', { text: $t('modals.confirm') })
			.addEventListener('click', () => {
				this.resolve(true);
				this.close();
			});

		buttonContainer.createEl('button', { text: $t('modals.cancel') })
			.addEventListener('click', () => {
				this.resolve(false);
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
