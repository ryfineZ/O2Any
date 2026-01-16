export const TEMPLATE_MARKERS = {
	header: {
		start: "%%hh%%",
		end: "%%/hh%%",
	},
	footer: {
		start: "%%tt%%",
		end: "%%/tt%%",
	},
};

const markerVariants = {
	header: {
		start: ["%%hh%%", "%%hh%"],
		end: ["%%/hh%%", "%%/hh%"],
	},
	footer: {
		start: ["%%tt%%", "%%tt%"],
		end: ["%%/tt%%", "%%/tt%"],
	},
};

const normalizeLine = (line: string) => line.trim().toLowerCase();

export const stripTemplateMarkerLines = (content: string) => {
	if (!content) {
		return content;
	}
	const lines = content.split(/\r?\n/);
	const filtered = lines.filter((line) => {
		const normalized = normalizeLine(line);
		return ![
			...markerVariants.header.start,
			...markerVariants.header.end,
			...markerVariants.footer.start,
			...markerVariants.footer.end,
		].includes(normalized);
	});
	return filtered.join("\n");
};

export const extractTemplateSection = (
	content: string,
	startMarker: string,
	endMarker: string
) => {
	const normalizedStart = normalizeLine(startMarker);
	const normalizedEnd = normalizeLine(endMarker);
	const lines = content.split(/\r?\n/);
	let startIndex = -1;
	let endIndex = -1;

	for (let i = 0; i < lines.length; i += 1) {
		const normalized = normalizeLine(lines[i]);
		if (
			normalized === normalizedStart ||
			normalized === normalizedStart.slice(0, -1)
		) {
			startIndex = i;
			break;
		}
	}

	if (startIndex === -1) {
		const rawStart =
			content.indexOf(startMarker) >= 0
				? startMarker
				: startMarker.slice(0, -1);
		const rawEnd =
			content.indexOf(endMarker) >= 0 ? endMarker : endMarker.slice(0, -1);
		const rawStartIndex = content.indexOf(rawStart);
		if (rawStartIndex === -1) {
			return { section: "", content };
		}
		const rawEndIndex = content.indexOf(
			rawEnd,
			rawStartIndex + rawStart.length
		);
		if (rawEndIndex === -1) {
			return { section: "", content };
		}
		const section = content
			.slice(rawStartIndex + rawStart.length, rawEndIndex)
			.trim();
		const before = content.slice(0, rawStartIndex);
		const after = content.slice(rawEndIndex + rawEnd.length);
		const merged = [before.trimEnd(), after.trimStart()].join("\n");
		return { section, content: merged.replace(/\n{3,}/g, "\n\n").trim() };
	}

	for (let i = startIndex + 1; i < lines.length; i += 1) {
		const normalized = normalizeLine(lines[i]);
		if (
			normalized === normalizedEnd ||
			normalized === normalizedEnd.slice(0, -1)
		) {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) {
		return { section: "", content };
	}

	const section = lines.slice(startIndex + 1, endIndex).join("\n").trim();
	const before = lines.slice(0, startIndex);
	const after = lines.slice(endIndex + 1);
	const merged = [...before, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
	return { section, content: merged.trim() };
};
