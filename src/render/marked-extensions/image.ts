/**
 * marked extension for handling images
 * 
 * post processing;
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { sanitizeHTMLToDom, TAbstractFile, TFile } from "obsidian";
import { serializeChildren } from "../../utils/dom";
import { One2MpMarkedExtension } from "./extension";


export class Image extends One2MpMarkedExtension {
	private isImageFile(file: TAbstractFile | null): file is TFile {
		if (!(file instanceof TFile)) {
			return false;
		}
		const ext = file.extension.toLowerCase();
		return ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext);
	}

	private findImageFile(rawPath: string): TFile | null {
		const vault = this.plugin.app.vault;
		const activeFile = this.plugin.app.workspace.getActiveFile();
		const noteDir = activeFile?.parent?.path ?? "";
		const appPrefix = "app://obsidian.md/";
		let path = rawPath.trim();
		if (path.startsWith(appPrefix)) {
			path = decodeURIComponent(path.slice(appPrefix.length));
		}
		path = path.split("|")[0].split("?")[0].split("#")[0];
		if (!path) {
			return null;
		}
		let file = this.plugin.app.metadataCache.getFirstLinkpathDest(
			path,
			activeFile?.path ?? ""
		) as TAbstractFile | null;
		if (this.isImageFile(file)) {
			return file;
		}
		if (path.includes("/")) {
			const basename = path.split("/").pop() || path;
			file = this.plugin.app.metadataCache.getFirstLinkpathDest(
				basename,
				activeFile?.path ?? ""
			) as TAbstractFile | null;
			if (this.isImageFile(file)) {
				return file;
			}
		}
		const vaultConfig = (vault as { config?: { attachmentFolderPath?: string } })
			.config;
		const attachmentFolderPath = vaultConfig?.attachmentFolderPath ?? "";
		const basename = path.split("/").pop() || path;
		const candidates: string[] = [];
		if (!attachmentFolderPath || attachmentFolderPath === ".") {
			if (noteDir) {
				candidates.push(`${noteDir}/${path}`);
				candidates.push(`${noteDir}/${basename}`);
			} else {
				candidates.push(path, basename);
			}
		} else if (attachmentFolderPath.startsWith("./")) {
			const rel = attachmentFolderPath.slice(2);
			const base = noteDir ? `${noteDir}/${rel}` : rel;
			candidates.push(`${base}/${path}`);
			candidates.push(`${base}/${basename}`);
		} else {
			candidates.push(`${attachmentFolderPath}/${path}`);
			candidates.push(`${attachmentFolderPath}/${basename}`);
		}
		for (const candidate of candidates) {
			file = vault.getAbstractFileByPath(candidate);
			if (this.isImageFile(file)) {
				return file;
			}
		}
		const files = vault.getAllLoadedFiles();
		for (const f of files) {
			if (f instanceof TFile && f.basename === basename && this.isImageFile(f)) {
				return f;
			}
		}
		return null;
	}

	private resolveImageSrc(src: string): string {
		const raw = src.trim();
		if (!raw) {
			return raw;
		}
		if (/^(https?:|data:)/i.test(raw)) {
			return raw;
		}
		const file = this.findImageFile(raw);
		if (file) {
			return this.plugin.app.vault.getResourcePath(file);
		}
		return src;
	}

	processImage(dom: HTMLDivElement) {

		const imgEls = dom.querySelectorAll('img')
		
		for (let i = 0; i < imgEls.length; i++) {
			const currentImg = imgEls[i]
			
			const classNames = currentImg.getAttribute('class')?.split(' ')
			
			
			if (classNames?.includes('one2mp-avatar-image')) {
				continue
			}
			const src = currentImg.getAttribute('src');
			if (src) {
				currentImg.setAttribute('src', this.resolveImageSrc(src));
			}

			const title = currentImg.getAttribute('title')?.trim() || ''
			const caption = title
			const figureEl = createEl('figure',{cls:'image-with-caption'})
			currentImg.parentNode?.insertBefore(figureEl, currentImg)
			figureEl.appendChild(currentImg)
			if (caption){
				const captionRow = figureEl.createEl('div', { cls:'image-caption-row'})
				captionRow.createEl('div', { cls:'triangle'})
				captionRow.createEl('figcaption', { cls:'image-caption', text: caption })
			}
		}
		return dom
	}
	postprocess(html: string): Promise<string> {

		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		this.processImage(tempDiv)
		return Promise.resolve(serializeChildren(tempDiv));
	}

	markedExtension(): MarkedExtension {
		return {
			renderer: {
				image: (token: Tokens.Image) => {
					const src = this.resolveImageSrc(token.href || "");
					const alt = token.text ? `alt="${token.text}"` : `alt=""`;
					const titleAttr = token.title ? ` title="${token.title}"` : "";
					return `<img src="${src}" ${alt}${titleAttr} />`;
				},
			},
			extensions: [],
		}
	}
}
