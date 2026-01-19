import { App, normalizePath, Notice, TFile } from "obsidian";
import { RedBookParser } from "./redbook-parser";

const safeName = (name: string) => {
	return name.replace(/[\\/:*?"<>|]/g, "-").trim() || "未命名";
};

const ensureFolder = async (app: App, folder: string) => {
	if (!app.vault.getAbstractFileByPath(folder)) {
		await app.vault.createFolder(folder);
	}
};

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
			candidates.push(`${activeFile?.parent?.path ?? ""}/${rel}/${basename}`);
			candidates.push(`${activeFile?.parent?.path ?? ""}/${rel}/${path}`);
		} else {
			candidates.push(`${attachmentFolderPath}/${basename}`);
			candidates.push(`${attachmentFolderPath}/${path}`);
			if (activeFile?.parent?.path) {
				candidates.push(`${activeFile.parent.path}/${attachmentFolderPath}/${basename}`);
				candidates.push(`${activeFile.parent.path}/${attachmentFolderPath}/${path}`);
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

const formatNow = () => {
	const now = new Date();
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

export const exportRedBookPackage = async (
	app: App,
	file: TFile,
	parser: RedBookParser
) => {
	const content = await app.vault.cachedRead(file);
	const result = await parser.parse(content);
	const parentPath = file.parent?.path || "";
	const title = safeName(file.basename);
	const baseFolder = normalizePath(`${parentPath}/小红书导出/${title}-${formatNow()}`);
	const imageFolder = normalizePath(`${baseFolder}/图片`);
	await ensureFolder(app, normalizePath(`${parentPath}/小红书导出`));
	await ensureFolder(app, baseFolder);
	await ensureFolder(app, imageFolder);

	const docPath = normalizePath(`${baseFolder}/文案.txt`);
	await app.vault.create(docPath, result.text);

	let sequenceText = "";
	let successCount = 0;
	for (let i = 0; i < result.images.length; i += 1) {
		const raw = result.images[i];
		const index = i + 1;
		const fileRef = resolveVaultImageFile(app, raw);
		if (!fileRef) {
			sequenceText += `图${index}: 未找到（${raw}）\n`;
			continue;
		}
		const ext = fileRef.extension || "png";
		const filename = `${String(index).padStart(2, "0")}-${safeName(fileRef.basename)}.${ext}`;
		const destPath = normalizePath(`${imageFolder}/${filename}`);
		const data = await app.vault.readBinary(fileRef);
		await app.vault.adapter.writeBinary(destPath, data);
		sequenceText += `图${index}: ${filename}（原始：${raw}）\n`;
		successCount += 1;
	}

	const sequencePath = normalizePath(`${baseFolder}/上传顺序.txt`);
	await app.vault.create(sequencePath, sequenceText.trim() + "\n");

	new Notice(`小红书素材已导出：${baseFolder}（${successCount}/${result.images.length}）`);
	return {
		folder: baseFolder,
		imageCount: result.images.length,
		successCount,
	};
};
