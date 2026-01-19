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

const normalizeSpace = (content: string): string => {
	return content.replace(/\n{3,}/g, "\n\n").trim();
};

const getEmojiNum = (index: number) => {
	return defaultOptions.orderedListStyle[index - 1] || `${index}.`;
};

export class RedBookParser {
	private buildRenderer(images: string[]) {
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
				images.push(href || "");
				return `【图${images.length}】`;
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
		const marked = new Marked();
		marked.use({ gfm: true, breaks: true });
		marked.use({ renderer: this.buildRenderer(images) });
		const raw = await marked.parse(cleaned);
		const plain = normalizeSpace(stripHtml(String(raw)));
		return {
			text: plain,
			images,
		};
	}
}
