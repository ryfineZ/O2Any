import { AbstractInputSuggest, App, TAbstractFile, TFile } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		private inputEl: HTMLInputElement,
		private extensions: string[] = []
	) {
		super(app, inputEl);
	}

	getSuggestions(inputStr: string): TFile[] {
		const lower = inputStr.toLowerCase();
		const files = this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFile => file instanceof TFile);
		return files.filter((file) => {
			if (this.extensions.length && !this.extensions.includes(file.extension)) {
				return false;
			}
			return file.path.toLowerCase().includes(lower);
		});
	}

	renderSuggestion(file: TAbstractFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TAbstractFile): void {
		this.inputEl.value = file.path;
		this.inputEl.trigger("input");
		this.close();
	}
}
