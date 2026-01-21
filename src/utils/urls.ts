/**
 * Url handling
 */
import { App, sanitizeHTMLToDom, TAbstractFile, TFile } from 'obsidian';
import { serializeChildren } from './dom';

export function isMarkdownFile(file: TFile | TAbstractFile) {
	let ext = ''
	if (file instanceof TFile) {
        ext = file.extension;
    } 
    return ['md', 'markdown'].includes(ext);
}

export function getMetadata(file: TFile, app: App) {
    return app.metadataCache.getFileCache(file)?.frontmatter;
}

export class UrlUtils {
    private app: App;
    constructor(app: App) {
        this.app = app;
    }
    public parseObsidianUrl(url: string): string | null {
        const regex = /obsidian:\/\/open\?vault=(.*?)&file=([^,]*),?(.*)$/;
        const match = url.match(regex);

        if (match && match[2]) {
            return decodeURIComponent(match[2]);
        }
        return null;
    }
    public getFileFromPath(filePath: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            return file;
        }
        return null;
    }
    public getDisplayUrl(file: TFile): string | null {
        if (file) {
            try {
                return this.app.vault.getResourcePath(file);
            } catch (error) {
                console.error('Error reading file:', error);
            }
        }
        return null;
    }
    public getInternalLinkDisplayUrl(internalLink: string): string | null {
        const filePath = this.parseObsidianUrl(internalLink);

        if (filePath) {
            const file = this.getFileFromPath(filePath);

            if (file) {
                return this.getDisplayUrl(file);
            }
        }
        return null;
    }
}

export function DomToDom(node: HTMLElement, queies: string[]) {
    let index = 0;
    const nodeMap = new Map<string, HTMLElement>();
    for (const query of queies) {
        const elements = node.querySelectorAll(query);
        for (const element of elements) {
            const replaceNode = createDiv()
            replaceNode.id = `one2mp-replace-${index}`
            nodeMap.set(replaceNode.id, element as HTMLElement)
            element.replaceWith(replaceNode);
            index++;
        }
    }
    const html = serializeChildren(node)
    const root = sanitizeHTMLToDom(html)
    for (const [id, element] of nodeMap) {
        const replaceNode = root.querySelector(`#${id}`)
        if (replaceNode) {
            replaceNode.replaceWith(element)
        }
    }
    return root
}
