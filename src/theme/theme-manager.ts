/** process custom theme content */
import {
	CachedMetadata,
	Notice,
	TFile,
	TFolder,
	requestUrl,
	normalizePath,
} from "obsidian";
// import { combinedCss } from "src/assets/css/template-css";
import { $t } from "src/lang/i18n";
import One2MpPlugin from "src/main";
import { parseFrontmatter } from "src/utils/frontmatter";
import { CSSMerger } from "./CssMerger";

export type WeChatTheme = {
	name: string;
	path: string;
	content?: string;

}
export class ThemeManager {
	private static instance: ThemeManager | null = null;
	private cssMerger: CSSMerger | null = null;
	private cachedCssKey: string | null = null;

	async downloadThemes() {
		// 主题下载：拉取 themes.json，然后逐个保存到自定义主题目录
		const baseUrls = [
			"https://raw.githubusercontent.com/ryfineZ/O2Any/main/themes/",
			"https://fastly.jsdelivr.net/gh/ryfineZ/O2Any@main/themes/",
			"https://ghproxy.com/https://raw.githubusercontent.com/ryfineZ/O2Any/main/themes/",
			"https://gitee.com/ryfineZ/O2Any/raw/main/themes/",
			"https://raw.githubusercontent.com/ryfineZ/O2Any/master/themes/",
			"https://fastly.jsdelivr.net/gh/ryfineZ/O2Any@master/themes/",
			"https://ghproxy.com/https://raw.githubusercontent.com/ryfineZ/O2Any/master/themes/",
			"https://gitee.com/ryfineZ/O2Any/raw/master/themes/",
		];
		const saveDir = this.normalizeThemeFolder(
			this.plugin.settings.css_styles_folder
		);

		// Create save directory if it doesn't exist
		if (!this.plugin.app.vault.getAbstractFileByPath(saveDir)) {
			await this.plugin.app.vault.createFolder(saveDir);
		}

		try {
			let url = "";
			let themesResponse;
			let lastError: Error | null = null;
			for (const candidate of baseUrls) {
				try {
					themesResponse = await requestUrl(`${candidate}themes.json`);
					if (themesResponse.status === 200) {
						url = candidate;
						break;
					}
					lastError = new Error(themesResponse.text);
				} catch (error) {
					lastError =
						error instanceof Error ? error : new Error(String(error));
				}
			}
			if (!themesResponse || themesResponse.status !== 200 || !url) {
				throw new Error(
					$t("views.theme-manager.failed-to-fetch-themes-json-themesrespon", [
						lastError?.message ?? "unknown",
					])
				);
			}

			const themesData = themesResponse.json;
			const themes = themesData.themes;
			let successCount = 0;
			let failedCount = 0;
			let skippedCount = 0;
			const overwrite = this.plugin.settings.themeDownloadOverwrite;

			// Download each theme file
			for (const theme of themes) {
				try {
					const filePath = `${saveDir}/${theme.file}`;
					const existing =
						this.plugin.app.vault.getAbstractFileByPath(filePath);
					if (existing && !overwrite) {
						skippedCount += 1;
						continue;
					}

					const encodedFile = encodeURIComponent(theme.file);
					const fileResponse = await requestUrl(`${url}${encodedFile}`);
					if (fileResponse.status !== 200) {
						console.warn(`Failed to download ${theme.file}: ${fileResponse.text}`);
						failedCount += 1;
						continue;
					}

					const fileContent = fileResponse.text;
					if (existing) {
						if (existing instanceof TFile) {
							await this.plugin.app.vault.modify(existing, fileContent);
							successCount += 1;
							continue;
						}
						failedCount += 1;
						continue;
					}
					await this.plugin.app.vault.create(filePath, fileContent);
					successCount += 1;
				} catch (error) {
					console.error(error);
					failedCount += 1;
					new Notice($t('views.theme-manager.error-downloading-theme') + error.message);
					continue;
				}
			}
			new Notice(
				$t("views.theme-manager.download-summary", [
					String(successCount),
					String(failedCount),
					String(skippedCount),
				])
			);
		} catch (error) {
			console.error("Error downloading themes:", error);
			new Notice($t('views.theme-manager.error-downloading-themes'));
		}
	}
	private plugin: One2MpPlugin;
	defaultCssRoot: string | undefined;
	themes: WeChatTheme[] = [];
	// static template_css: string = combinedCss;

	private constructor(plugin: One2MpPlugin) {
		this.plugin = plugin;

	}
	static getInstance(plugin: One2MpPlugin): ThemeManager {
		if (!this.instance) {
			this.instance = new ThemeManager(plugin);
		}
		return this.instance;

	}
	static resetInstance() {
		this.instance = null;
	}

	async loadThemes() {
		this.themes = [];
		const folder_path = this.normalizeThemeFolder(
			this.plugin.settings.css_styles_folder
		);
		const folder = this.plugin.app.vault.getAbstractFileByPath(folder_path);
		if (folder instanceof TFolder) {
			this.themes = await this.getAllThemesInFolder(folder);
		}
		return this.themes;
	}
	private normalizeThemeFolder(raw?: string) {
		let folder = (raw ?? "").trim();
		if (!folder) {
			folder = "one2mp-css-styles";
		}
		folder = normalizePath(folder);
		if (folder.startsWith("/")) {
			folder = folder.slice(1);
		}
		return folder;
	}
	public cleanCSS(css: string): string {

		css = css.replace(/```[cC][Ss]{2}\s*|\s*```/g, '').trim()
		const reg_multiple_line_comments = /\/\*[\s\S]*?\*\//g;
		const reg_single_line_comments = /\/\/.*/g;
		const reg_whitespace = /\s+/g;
		const reg_invisible_chars = /[\u200B\u00AD\uFEFF\u00A0]/g;

		let cleanedCSS = css
			.replace(reg_multiple_line_comments, '')
			.replace(reg_single_line_comments, '')
			.replace(reg_whitespace, ' ')
			.replace(reg_invisible_chars, '');

		return cleanedCSS.trim();
	}
	private async extractCSSblocks(path: string) {
		// 仅提取 ```css``` 代码块，避免把说明文字当成样式
		const result: string[] = []
		const file = this.plugin.app.vault.getFileByPath(path);
		if (!file) {
			return ''
		}
		const cache: CachedMetadata | null = this.plugin.app.metadataCache.getFileCache(file);
		if (!cache?.sections) return ''
		const content = await this.plugin.app.vault.read(file);

		for (const section of cache.sections) {
			if (section.type === "code" ) {
				const rawBlock = content.substring(
					section.position.start.offset,
					section.position.end.offset
				);
				if  (!/^```css/i.test(rawBlock)) continue;
				// const cleaned = rawBlock.replace(/^```css\s*/, "").replace(/```$/, "").trim();
				const first = rawBlock.indexOf('\n');
				const last = rawBlock.lastIndexOf('\n');
				const cleaned = rawBlock.substring(first + 1, last).trim();
				result.push(cleaned);
			}
		}
		// console.log('result=>', result);
		
		return result.join('\n')

	}
	public async getThemeContent(path: string) {
		const file = this.plugin.app.vault.getFileByPath(path);
		if (!file) {
			// return ThemeManager.template_css; //DEFAULT_STYLE;
			return ''
		}
		const fileContent = await this.plugin.app.vault.cachedRead(file);

		const reg_css_block = /```[cC][Ss]{2}\s*([\s\S]+?)\s*```/gs;
		// const reg_css_block = /```css\s*([\s\S]*?)```/g

		const cssBlocks: string[] = [];
		let match
		while ((match = reg_css_block.exec(fileContent)) !== null) {
			cssBlocks.push(this.cleanCSS(match[1].trim()));
		}
		console.debug('cssBlocks=>', cssBlocks);

		return cssBlocks.join('\n');

	}
	public async getCSS() {
		let custom_css = '' //this.defaultCssRoot.toString() //''
		if (this.plugin.settings.custom_theme) {
			// 只读取主题里的 CSS 片段，避免污染
			// custom_css = await this.getThemeContent(this.plugin.settings.custom_theme)
			custom_css = await this.extractCSSblocks(this.plugin.settings.custom_theme)
		}

		return custom_css

	}
	public getShadowStleSheet() {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(`
  /* 滚动条样式 we use shadow dom, make the preview looks better.*/
.table-container::-webkit-scrollbar {
	width: 8px;
	height: 8px;
	background-color: var(--scrollbar-bg);
}

.table-container::-webkit-scrollbar-thumb {
	background-color: var(--scrollbar-thumb-bg);
    -webkit-border-radius: var(--radius-l);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-width: 3px 3px 3px 2px;
    min-height: 45px;
}
.table-container::-webkit-scrollbar-thumb:hover {
	background-color: var(--scrollbar-thumb-hover-bg);
}

.one2mp-article::-webkit-scrollbar-corner{
	background: transparent;
}

.one2mp-article pre::-webkit-scrollbar {
	width: 8px;
	height: 8px;
	background-color: var(--scrollbar-bg);
}

.one2mp-article pre::-webkit-scrollbar-thumb {
	background-color: var(--scrollbar-thumb-bg);
    -webkit-border-radius: var(--radius-l);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-width: 3px 3px 3px 2px;
    min-height: 45px;
}

.one2mp-article pre::-webkit-scrollbar-thumb:hover {
	background-color: var(--scrollbar-thumb-hover-bg);
}

.one2mp-article::-webkit-scrollbar-corner{
	background: transparent;
}
`);

		return sheet

	}
	private async getAllThemesInFolder(folder: TFolder): Promise<WeChatTheme[]> {
		const themes: WeChatTheme[] = [];

		const getAllFiles = async (folder: TFolder) => {
			const promises = folder.children.map(async (child) => {
				if (child instanceof TFile && child.extension === "md") {
					const theme = await this.getThemeProperties(child);
					if (theme) {
						themes.push(theme);
					}
				} else if (child instanceof TFolder) {
					await getAllFiles(child);
				}
			});

			await Promise.all(promises);
		};

		await getAllFiles(folder);

		return themes;
	}

	private async getThemeProperties(file: TFile): Promise<WeChatTheme | undefined> {
		const fileContent = await this.plugin.app.vault.cachedRead(file);
		const { data } = parseFrontmatter(fileContent); // 解析前置元数据
		const themeName = (data.theme_name || "").trim();
		if (!themeName) {
			// it is not a valid theme.
			return;
		}

		return {
			name: themeName,
			path: file.path,
		};
	}

	public async applyTheme(htmlRoot: HTMLElement) {
		const customCss = await this.getCSS();
		const cssKey = customCss;
		if (!this.cssMerger || this.cachedCssKey !== cssKey) {
			this.cssMerger = new CSSMerger();
			await this.cssMerger.init(customCss);
			this.cachedCssKey = cssKey;
		}
		// 如果已经应用过相同主题则跳过，减少重复遍历
		if (htmlRoot.dataset?.one2mpThemeKey === cssKey) {
			return htmlRoot;
		}
		const node = this.cssMerger.applyStyleToElement(htmlRoot);
		node.dataset.one2mpThemeKey = cssKey;
		return node;

	}
}
