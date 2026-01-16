import { App, Modal, Notice } from "obsidian";
import { $t } from "src/lang/i18n";

export class MpcardInsertModal extends Modal {
	private readonly onSubmit: (content: string) => void;
	private inputEl: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		onSubmit: (content: string) => void,
		private readonly initialContent: string = ""
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: $t("modals.mpcard.title") });
		contentEl.createEl("p", { text: $t("modals.mpcard.hint") });

		this.inputEl = contentEl.createEl("textarea", {
			cls: "one2mp-mpcard-input",
		});
		this.inputEl.placeholder = $t("modals.mpcard.placeholder");
		if (this.initialContent) {
			this.inputEl.value = this.initialContent;
		}
		this.inputEl.focus();

		const buttonContainer = contentEl.createDiv("modal-button-container");
		buttonContainer
			.createEl("button", { text: $t("modals.mpcard.insert") })
			.addEventListener("click", () => {
				const raw = this.inputEl?.value ?? "";
				const normalized = this.normalizeMpcard(raw);
				if (!normalized) {
					new Notice($t("modals.mpcard.empty"));
					return;
				}
				this.onSubmit(normalized);
				this.close();
			});
		buttonContainer
			.createEl("button", { text: $t("modals.cancel") })
			.addEventListener("click", () => {
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.inputEl = null;
	}

	private normalizeMpcard(input: string) {
		const trimmed = input.trim();
		if (!trimmed) {
			return "";
		}
		if (trimmed.startsWith("```")) {
			const lines = trimmed.split(/\r?\n/);
			if (!/```\\s*mpcard/i.test(lines[0])) {
				lines[0] = "```mpcard";
			}
			const hasClosing = lines.slice(1).some((line) => line.trim() === "```");
			if (!hasClosing) {
				lines.push("```");
			}
			return `\n${lines.join("\n")}\n`;
		}
		return `\n\`\`\`mpcard\n${trimmed}\n\`\`\`\n`;
	}
}
