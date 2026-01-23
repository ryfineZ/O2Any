import { Marked } from "marked";

export type RedBookParseResult = {
	text: string;
	images: string[];
};

type RedBookOptions = {
	heading: string[];
	listStyle: string;
	orderedListStyle: string[];
	taskListStyle: string[];
	hr: string;
};

const defaultOptions: RedBookOptions = {
	heading: ["✨", "🔹", "🔸"],
	listStyle: "▫️",
	orderedListStyle: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"],
	taskListStyle: ["🔲", "✅"],
	hr: "---------------------",
};

const stripFrontmatter = (content: string): string => {
	if (!content.startsWith("---")) {
		return content;
	}
	const end = content.indexOf("\n---", 3);
	if (end === -1) {
		return content;
	}
	return content.slice(end + 4);
};

const stripHtml = (content: string): string => {
	return content.replace(/<[^>]*>/g, "");
};

const normalizeObsidianImage = (content: string): string => {
	// 将 Obsidian 图片语法 ![[xxx|400]] 转为标准 Markdown 图片，便于统一解析
	return content.replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, (_match, path) => {
		const safePath = String(path).trim();
		return safePath ? `![](${safePath})` : "";
	});
};

const extractImagesFromMarkdown = (content: string, pushImage: (raw: string) => number): void => {
	// 单次扫描，保持图片在文中的顺序
	const pattern = /!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g;
	for (const match of content.matchAll(pattern)) {
		const rawToken = match[0] || "";
		if (!rawToken) {
			continue;
		}
		if (rawToken.startsWith("![[")) {
			const inner = rawToken.slice(3, -2);
			const value = inner.split("|")[0].split("#")[0].trim();
			if (value) {
				pushImage(value);
			}
			continue;
		}
		if (rawToken.startsWith("![")) {
			let inner = rawToken.replace(/^!\[[^\]]*\]\(/, "").replace(/\)$/, "");
			inner = inner.trim();
			if (inner.startsWith("<") && inner.endsWith(">")) {
				inner = inner.slice(1, -1).trim();
			}
			const spaceIndex = inner.indexOf(" ");
			if (spaceIndex > 0) {
				inner = inner.slice(0, spaceIndex).trim();
			}
			if (inner) {
				pushImage(inner);
			}
		}
	}
};

const normalizeSpace = (content: string): string => {
	return content.replace(/\n{3,}/g, "\n\n").trim();
};

const getEmojiNum = (index: number) => {
	return defaultOptions.orderedListStyle[index - 1] || `${index}.`;
};

export class RedBookParser {
	private buildRenderer(pushImage: (raw: string) => number) {
		const getText = (value: unknown): string => {
			if (value == null) {
				return "";
			}
			if (typeof value === "string") {
				return value;
			}
			const token = value as { text?: string; raw?: string };
			if (typeof token.text === "string") {
				return token.text;
			}
			if (typeof token.raw === "string") {
				return token.raw;
			}
			return "";
		};

		const getDepth = (token: unknown, level?: number) => {
			const obj = token as { depth?: number; level?: number } | undefined;
			if (obj && typeof obj.depth === "number") {
				return obj.depth;
			}
			if (obj && typeof obj.level === "number") {
				return obj.level;
			}
			if (typeof level === "number") {
				return level;
			}
			return 1;
		};

		const buildListFromLines = (lines: string[], ordered: boolean, start = 1) => {
			let result = "";
			let orderIndex = start;
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					continue;
				}
				if (ordered) {
					result += `${getEmojiNum(orderIndex)} ${trimmed}\n`;
					orderIndex += 1;
					continue;
				}
				const isTask =
					trimmed.startsWith(defaultOptions.taskListStyle[0]) ||
					trimmed.startsWith(defaultOptions.taskListStyle[1]);
				result += isTask
					? `${trimmed}\n`
					: `${defaultOptions.listStyle} ${trimmed}\n`;
			}
			return `\n${result}\n`;
		};

		const renderer: any = {
			heading(token: unknown, level?: number): string {
				const text = getText(token);
				const depth = getDepth(token, level);
				const emoji = defaultOptions.heading[depth - 1] || "";
				return `${emoji} ${text}\n\n`;
			},
			paragraph(token: unknown): string {
				const text = getText(token);
				return `${text}\n\n`;
			},
			strong(token: unknown): string {
				return getText(token);
			},
			em(token: unknown): string {
				return getText(token);
			},
			codespan(token: unknown): string {
				return getText(token);
			},
			code(token: any, infostring?: string): string {
				const codeText = typeof token === "string" ? token : (token?.text ?? "");
				const lang = (token && typeof token.lang === "string" ? token.lang : infostring) || "";
				const langLabel = lang ? `（${lang}）` : "";
				return `【代码块${langLabel}】\n${codeText}\n\n`;
			},
			blockquote(token: unknown): string {
				const text = getText(token);
				const lines = text.split("\n").filter((line) => line.trim());
				return `${lines.map((line) => `    ${line}`).join("\n")}\n\n`;
			},
			hr(): string {
				return `\n${defaultOptions.hr}\n`;
			},
			list(token: any, ordered?: boolean): string {
				if (typeof token === "string") {
					const lines = token.split("\n");
					return buildListFromLines(lines, !!ordered, 1);
				}
				const orderedFlag = token?.ordered ?? ordered ?? false;
				const start = typeof token?.start === "number" ? token.start : 1;
				if (Array.isArray(token?.items)) {
					let result = "";
					let orderIndex = start;
					for (const item of token.items) {
						const text = getText(item);
						if (orderedFlag) {
							result += `${getEmojiNum(orderIndex)} ${text}\n`;
							orderIndex += 1;
							continue;
						}
						if (item?.task) {
							const icon = item.checked ? defaultOptions.taskListStyle[1] : defaultOptions.taskListStyle[0];
							result += `${icon} ${text}\n`;
							continue;
						}
						result += `${defaultOptions.listStyle} ${text}\n`;
					}
					return `\n${result}\n`;
				}
				return "";
			},
			listitem(token: any, task?: boolean, checked?: boolean): string {
				if (typeof token === "string") {
					if (task) {
						const icon = checked ? defaultOptions.taskListStyle[1] : defaultOptions.taskListStyle[0];
						return `${icon} ${token}`;
					}
					return token;
				}
				const text = getText(token);
				const isTask = token?.task ?? task ?? false;
				if (!isTask) {
					return text;
				}
				const icon = (token?.checked ?? checked)
					? defaultOptions.taskListStyle[1]
					: defaultOptions.taskListStyle[0];
				return `${icon} ${text}`;
			},
			link(token: any, _title?: string | null, text?: string): string {
				if (typeof token === "string") {
					return token;
				}
				const href = token?.href ?? "";
				const label = token?.text ?? text ?? "";
				if (!href) {
					return label;
				}
				return `${label}（链接：${href}）`;
			},
			image(token: any): string {
				const href = token?.href ?? (typeof token === "string" ? token : "");
				const index = pushImage(href || "");
				return `【图${index}】`;
			},
			br(): string {
				return "\n";
			},
		};
		return renderer;
	}

	async parse(content: string): Promise<RedBookParseResult> {
		const cleaned = stripFrontmatter(content);
		const images: string[] = [];
		const imageSet = new Set<string>();
		const pushImage = (raw: string): number => {
			const value = (raw || "").trim();
			if (!value) {
				return images.length + 1;
			}
			if (!imageSet.has(value)) {
				imageSet.add(value);
				images.push(value);
			}
			return images.indexOf(value) + 1;
		};
		extractImagesFromMarkdown(cleaned, pushImage);
		const normalized = normalizeObsidianImage(cleaned);
		const marked = new Marked();
		marked.use({ gfm: true, breaks: true });
		marked.use({ renderer: this.buildRenderer(pushImage) });
		const raw = await marked.parse(normalized);
		const plain = normalizeSpace(stripHtml(String(raw)));
		return {
			text: plain,
			images,
		};
	}
}
