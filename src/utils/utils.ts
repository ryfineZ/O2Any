import { App, FileSystemAdapter, TFile, requestUrl } from "obsidian";

export function areObjectsEqual(obj1: unknown, obj2: unknown): boolean {
    if (obj1 === obj2) return true;

    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }

    const keys1 = Object.keys(obj1 as Record<string, unknown>);
    const keys2 = Object.keys(obj2 as Record<string, unknown>);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        const obj1Record = obj1 as Record<string, unknown>;
        const obj2Record = obj2 as Record<string, unknown>;
        if (!keys2.includes(key) || !areObjectsEqual(obj1Record[key], obj2Record[key])) {
            return false;
        }
    }

    return true;
}

const resolveVaultImageFile = (app: App, rawPath: string): TFile | null => {
	const vault = app.vault;
	const activeFile = app.workspace.getActiveFile();
	const vaultConfig = (vault as { config?: { attachmentFolderPath?: string } })
		.config;
	const attachmentFolderPath = vaultConfig?.attachmentFolderPath ?? "";
	let path = rawPath.trim();
	if (!path) {
		return null;
	}
	path = path.split("|")[0].split("?")[0].split("#")[0];
	if (path.startsWith("/") || path.startsWith("\\")) {
		path = path.slice(1);
	}
	const direct = vault.getAbstractFileByPath(path);
	if (direct instanceof TFile) {
		return direct;
	}
	const linked = app.metadataCache.getFirstLinkpathDest(
		path,
		activeFile?.path ?? ""
	);
	if (linked instanceof TFile) {
		return linked;
	}
	if (activeFile?.parent?.path) {
		const relativeCandidate = `${activeFile.parent.path}/${path}`;
		const relativeFile = vault.getAbstractFileByPath(relativeCandidate);
		if (relativeFile instanceof TFile) {
			return relativeFile;
		}
	}
	const basename = path.split("/").pop() || path;
	if (attachmentFolderPath) {
		const candidates: string[] = [];
		if (attachmentFolderPath.startsWith("./")) {
			const rel = attachmentFolderPath.slice(2);
			candidates.push(
				`${activeFile?.parent?.path ?? ""}/${rel}/${basename}`
			);
			candidates.push(
				`${activeFile?.parent?.path ?? ""}/${rel}/${path}`
			);
		} else {
			candidates.push(`${attachmentFolderPath}/${basename}`);
			candidates.push(`${attachmentFolderPath}/${path}`);
			if (activeFile?.parent?.path) {
				candidates.push(
					`${activeFile.parent.path}/${attachmentFolderPath}/${basename}`
				);
				candidates.push(
					`${activeFile.parent.path}/${attachmentFolderPath}/${path}`
				);
			}
		}
		for (const candidate of candidates) {
			const file = vault.getAbstractFileByPath(candidate);
			if (file instanceof TFile) {
				return file;
			}
		}
	}
	return null;
};

export async function fetchImageBlob(url: string, app?: App): Promise<Blob> {
    if (!url) {
        throw new Error(`Invalid URL: ${url}`);
    }

    if (url.startsWith('data:')) {
        return dataUrlToBlob(url);
    }
    if (app && url.startsWith("app://")) {
        const withoutScheme = url.slice("app://".length);
        const firstSlash = withoutScheme.indexOf("/");
        let rawPath =
            firstSlash >= 0 ? withoutScheme.slice(firstSlash + 1) : withoutScheme;
        rawPath = decodeURIComponent(rawPath);
        rawPath = rawPath.split("?")[0].split("#")[0];
        const relativePath = rawPath.replace(/^\/+/, "");
        const absolutePath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
        const adapter = app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            const basePath = adapter.getBasePath();
            if (absolutePath.startsWith(basePath)) {
                let relative = absolutePath.slice(basePath.length);
                if (relative.startsWith("/") || relative.startsWith("\\")) {
                    relative = relative.slice(1);
                }
                const file = resolveVaultImageFile(app, relative);
                if (file instanceof TFile) {
                    const data = await app.vault.readBinary(file);
                    return new Blob([data]);
                }
            }
        }
        const file = resolveVaultImageFile(app, relativePath);
        if (file instanceof TFile) {
            const data = await app.vault.readBinary(file);
            return new Blob([data]);
        }
        throw new Error(`Image not found in vault: ${rawPath}`);
    }

    try {
        const response = await requestUrl(url);
        if (!response.arrayBuffer) {
            throw new Error(`Failed to fetch image from ${url}`);
        }
        return new Blob([response.arrayBuffer]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Error fetching image from ${url}: ${message}`);
    }
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, data] = dataUrl.split(',');
    const match = header.match(/data:(.*?);base64/);
    const mime = match ? match[1] : 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

export function replaceDivWithSection(root: HTMLElement){
    const html = serializeNode(root)
        .replaceAll(/<div /g, "<section ")
        .replaceAll(/<\/div>/g, "</section>");
    return html;

}

export function serializeNode(node: Node): string {
    return new XMLSerializer().serializeToString(node);
}

export function serializeChildren(node: ParentNode): string {
    return Array.from(node.childNodes)
        .map((child) => serializeNode(child))
        .join("");
}

export function removeThinkTags(content: string): string {
	// 使用正则表达式匹配 <think> 和 </think> 标签及其内容，并替换为空字符串
	const regex = /<think>[\s\S]*<\/think>/g;
	return content.replace(regex, "");
}
