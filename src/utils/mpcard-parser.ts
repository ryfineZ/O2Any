export type MpcardInfo = {
	id: string;
	headimg: string;
	nickname: string;
	signature: string;
	alias?: string;
	rawHtml?: string;
};

const decodeHtml = (value: string) => {
	if (!value) return value;
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
};

const escapeAttr = (value: string) =>
	value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const extractFence = (input: string) => {
	const match = input.match(/```mpcard\s*([\s\S]*?)```/i);
	if (match) {
		return match[1].trim();
	}
	return input.trim();
};

const pickAttr = (raw: string, name: string) => {
	const regex = new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`, "i");
	const match = raw.match(regex);
	if (!match) return "";
	return decodeHtml((match[2] ?? match[3] ?? "").trim());
};

const parseKeyValue = (raw: string): Partial<MpcardInfo> => {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const result: Record<string, string> = {};
	const keyValueRegex = /^(\w+):\s*"?(.*?)"?$/;
	for (const line of lines) {
		const match = line.match(keyValueRegex);
		if (match) {
			const key = match[1].trim().toLowerCase();
			const value = match[2].trim();
			result[key] = value;
		}
	}
	return {
		id: result.id || "",
		headimg: result.headimg || result.avatar || "",
		nickname: result.nickname || result.name || "",
		signature: result.signature || result.desc || result.description || "",
		alias: result.alias || "",
	};
};

export const parseMpcardInput = (input: string): MpcardInfo | null => {
	const raw = extractFence(input);
	if (!raw) {
		return null;
	}
	if (/<mp-common-profile/i.test(raw) || /\bdata-id=/.test(raw)) {
		const id = pickAttr(raw, "data-id");
		return {
			id,
			headimg: pickAttr(raw, "data-headimg"),
			nickname: pickAttr(raw, "data-nickname"),
			signature: pickAttr(raw, "data-signature"),
			alias: pickAttr(raw, "data-alias"),
			rawHtml: raw,
		};
	}
	const info = parseKeyValue(raw);
	return {
		id: info.id || "",
		headimg: info.headimg || "",
		nickname: info.nickname || "",
		signature: info.signature || "",
		alias: info.alias,
		rawHtml: "",
	};
};

export const buildOfficialMpcardHtml = (info: MpcardInfo) => {
	const id = escapeAttr(info.id || "");
	const headimg = escapeAttr(info.headimg || "");
	const nickname = escapeAttr(info.nickname || "");
	const signature = escapeAttr(info.signature || "");
	const alias = info.alias ? escapeAttr(info.alias) : "";
	const aliasAttr = ` data-alias="${alias}"`;
	return `<section class="mp_profile_iframe_wrp" nodeleaf=""><mp-common-profile class="js_uneditable custom_select_card mp_profile_iframe mp_common_widget js_wx_tap_highlight" data-pluginname="mpprofile" data-nickname="${nickname}"${aliasAttr} data-from="0" data-headimg="${headimg}" data-signature="${signature}" data-id="${id}" data-is_biz_ban="0" data-service_type="1" data-verify_status="0" data-origin_num="0" data-isban="0" data-biz_account_status="0" data-index="0"></mp-common-profile></section>`;
};

export const normalizeMpcardInput = (
	input: string
): { info: MpcardInfo; html: string } | null => {
	const info = parseMpcardInput(input);
	if (!info || !info.id || !info.rawHtml) {
		return null;
	}
	let html = info.rawHtml.trim();
	if (!/<mp-common-profile/i.test(html)) {
		return null;
	}
	if (!/^\s*<section/i.test(html)) {
		html = `<section class="mp_profile_iframe_wrp" nodeleaf="">${html}</section>`;
	}
	return { info, html };
};

export const renderMpcardPreview = (info: MpcardInfo) => {
	const headimg = escapeAttr(info.headimg || "");
	const nickname = escapeAttr(info.nickname || "");
	const signature = escapeAttr(info.signature || "");
	const idAttr = info.id ? ` data-id="${escapeAttr(info.id)}"` : "";
	return `<section${idAttr} class="one2mp-mpcard-wrapper"><div class="one2mp-mpcard-content"><img class="one2mp-mpcard-headimg" width="54" height="54" src="${headimg}"></img><div class="one2mp-mpcard-info"><div class="one2mp-mpcard-nickname">${nickname}</div><div class="one2mp-mpcard-signature">${signature}</div></div></div><div class="one2mp-mpcard-foot">公众号</div></section>`;
};
