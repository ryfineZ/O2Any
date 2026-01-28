export const FRONTMATTER_CANONICAL_KEYS = {
	title: "标题",
	author: "作者",
	digest: "摘要",
	sourceUrl: "原文链接",
	cover: "封面图",
	openComment: "开启评论",
	onlyFans: "仅粉丝可评论",
	wechatArticleUrl: "公众号链接",
} as const;

export const FRONTMATTER_ALIASES = {
	title: [FRONTMATTER_CANONICAL_KEYS.title, "title"],
	author: [FRONTMATTER_CANONICAL_KEYS.author, "author"],
	digest: [
		FRONTMATTER_CANONICAL_KEYS.digest,
		"digest",
		"description",
		"summary",
	],
	sourceUrl: [
		FRONTMATTER_CANONICAL_KEYS.sourceUrl,
		"content_source_url",
		"source_url",
	],
	cover: [
		FRONTMATTER_CANONICAL_KEYS.cover,
		"cover",
		"thumbnail",
		"one2mp_cover",
	],
	openComment: [
		FRONTMATTER_CANONICAL_KEYS.openComment,
		"need_open_comment",
		"open_comment",
	],
	onlyFans: [FRONTMATTER_CANONICAL_KEYS.onlyFans, "only_fans_can_comment"],
} as const;

export const WECHAT_ARTICLE_URL_KEYS = [
	FRONTMATTER_CANONICAL_KEYS.wechatArticleUrl,
	"公众号文章链接",
	"wechat_url",
	"wechat_article_url",
	"mp_url",
	"mp_article_url",
	"mp_link",
] as const;

export type FrontmatterRecord = Record<string, unknown> | null;

export const getFrontmatterString = (
	frontmatter: FrontmatterRecord,
	keys: readonly string[]
): string | undefined => {
	if (!frontmatter) {
		return undefined;
	}
	for (const key of keys) {
		const value = frontmatter[key];
		if (typeof value === "string" && value.trim() !== "") {
			return value.trim();
		}
	}
	return undefined;
};

export const getFrontmatterBool = (
	frontmatter: FrontmatterRecord,
	keys: readonly string[]
): number | undefined => {
	if (!frontmatter) {
		return undefined;
	}
	const trueValues = new Set([
		"1",
		"true",
		"yes",
		"y",
		"on",
		"是",
		"开启",
		"开",
	]);
	const falseValues = new Set([
		"0",
		"false",
		"no",
		"n",
		"off",
		"否",
		"关闭",
		"关",
	]);
	for (const key of keys) {
		const value = frontmatter[key];
		if (typeof value === "boolean") {
			return value ? 1 : 0;
		}
		if (typeof value === "number") {
			return value > 0 ? 1 : 0;
		}
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			if (trueValues.has(normalized)) {
				return 1;
			}
			if (falseValues.has(normalized)) {
				return 0;
			}
		}
	}
	return undefined;
};

export const getCoverFromFrontmatter = (
	frontmatter: FrontmatterRecord
): string | null => {
	if (!frontmatter) {
		return null;
	}
	for (const key of FRONTMATTER_ALIASES.cover) {
		const value = frontmatter[key];
		if (typeof value === "string" && value.trim() !== "") {
			return value.trim();
		}
	}
	return null;
};

export const getWechatArticleUrlFromFrontmatter = (
	frontmatter: FrontmatterRecord
): string | undefined => {
	return getFrontmatterString(frontmatter, WECHAT_ARTICLE_URL_KEYS);
};
