import { AbstractInputSuggest, App, TAbstractFile, TFolder } from 'obsidian'
export class FolderSuggest extends AbstractInputSuggest<TAbstractFile> {
    constructor(app: App, private inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    getSuggestions(inputStr: string): TAbstractFile[] {
        const folders = this.app.vault.getAllLoadedFiles().filter(file => file instanceof TFolder);
        return folders.filter(folder =>
            folder.path.toLowerCase().includes(inputStr.toLowerCase())
        );
    }

    renderSuggestion(folder: TAbstractFile, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TAbstractFile): void {
        this.inputEl.value = folder.path; 
        this.inputEl.trigger('input'); 
        this.close(); 
    }
}
