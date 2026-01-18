type FrontmatterResult = {
	data: Record<string, string>;
	content: string;
};

const stripQuotes = (value: string) => {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

export const parseFrontmatter = (markdown: string): FrontmatterResult => {
	if (!markdown.startsWith("---")) {
		return { data: {}, content: markdown };
	}
	const endIndex = markdown.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { data: {}, content: markdown };
	}
	const raw = markdown.slice(3, endIndex).trim();
	const rest = markdown.slice(endIndex + 4);
	const content = rest.replace(/^\r?\n/, "");
	const data: Record<string, string> = {};
	if (raw) {
		for (const line of raw.split(/\r?\n/)) {
			const match = line.match(/^([^:#]+):\s*(.*)$/);
			if (!match) {
				continue;
			}
			const key = match[1].trim();
			const value = stripQuotes(match[2]);
			if (key) {
				data[key] = value;
			}
		}
	}
	return { data, content };
};
