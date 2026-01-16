/**
 * marked extension for blockquote and callout
 *
 * credits to Sun BooShi, author of note-to-mp plugin
 */

import { MarkedExtension, Tokens } from "marked";
import { One2MpMarkedExtension } from "./extension";

type CalloutInfo = { icon: string };

const iconNote = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>`;
const iconAbstract = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-clipboard-list"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path></svg>`;
const iconInfo = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-info"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
const iconTodo = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-check-circle-2"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>`;
const iconTip = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-flame"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;
const iconSuccess = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-check"><path d="M20 6 9 17l-5-5"></path></svg>`;
const iconQuestion = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-help-circle"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>`;
const iconWarning = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-alert-triangle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`;
const iconFailure = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
const iconDanger = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-zap"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const iconBug = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-bug"><path d="m8 2 1.88 1.88"></path><path d="M14.12 3.88 16 2"></path><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"></path><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"></path><path d="M12 20v-9"></path><path d="M6.53 9C4.6 8.8 3 7.1 3 5"></path><path d="M6 13H2"></path><path d="M3 21c0-2.1 1.7-3.9 3.8-4"></path><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"></path><path d="M22 13h-4"></path><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"></path></svg>`;
const iconExample = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-list"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
const iconQuote = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-quote"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"></path></svg>`;

const calloutIcons = new Map<string, CalloutInfo>(Object.entries({
	note: { icon: iconNote },
	abstract: { icon: iconAbstract },
	summary: { icon: iconAbstract },
	tldr: { icon: iconAbstract },
	info: { icon: iconInfo },
	todo: { icon: iconTodo },
	tip: { icon: iconTip },
	hint: { icon: iconTip },
	important: { icon: iconTip },
	success: { icon: iconSuccess },
	check: { icon: iconSuccess },
	done: { icon: iconSuccess },
	question: { icon: iconQuestion },
	help: { icon: iconQuestion },
	faq: { icon: iconQuestion },
	warning: { icon: iconWarning },
	caution: { icon: iconWarning },
	attention: { icon: iconWarning },
	failure: { icon: iconFailure },
	fail: { icon: iconFailure },
	missing: { icon: iconFailure },
	danger: { icon: iconDanger },
	error: { icon: iconDanger },
	bug: { icon: iconBug },
	example: { icon: iconExample },
	quote: { icon: iconQuote },
	cite: { icon: iconQuote },
}));

function matchCallout(text: string | undefined) {
	if (!text) return "";
	const regex = /\[!(.*?)\]/;
	const match = text.match(regex);
	if (!match) return "";
	return match[1].trim();
}

function normalizeBlockquoteText(raw: string) {
	if (!raw) return "";
	return raw
		.split(/\r?\n/)
		.map((line) => line.replace(/^>\s?/, ""))
		.join("\n")
		.trim();
}

function getCalloutTitle(callout: string, text: string) {
	let title = callout.charAt(0).toUpperCase() + callout.slice(1).toLowerCase();
	let start = text.indexOf("]") + 1;
	if (text.indexOf("]-") > 0 || text.indexOf("]+") > 0) {
		start = start + 1;
	}
	let end = text.indexOf("\n");
	if (end === -1) end = text.length;
	if (start >= end) return title;
	const customTitle = text.slice(start, end).trim();
	if (customTitle !== "") {
		title = customTitle;
	}
	return title;
}

function wrapCalloutParagraphs(html: string) {
	if (!html) return html;
	return html.replace(
		/<p([^>]*)>([\s\S]*?)<\/p>/g,
		'<p$1><span class="callout-text">$2</span></p>'
	);
}

export class BlockquoteRenderer extends One2MpMarkedExtension {
	prepare(): Promise<void> {
		if (!this.marked) {
			console.error("marked is not ready");
		}
		return Promise.resolve();
	}

	async rendererBlockquote(token: Tokens.Blockquote) {
		const textContent = token.text || normalizeBlockquoteText(token.raw || "");
		const parsedText = await this.marked.parseInline(textContent);
		const text = parsedText.replace(/\n/gm, "<br>").trim();
		return `<blockquote dir="auto"><span class="icon-pin"></span><div class="blockquote-inner">${text}</div></blockquote>`;
	}

	async rendererCallout(token: Tokens.Blockquote) {
		const rawText = token.text || normalizeBlockquoteText(token.raw || "");
		const callout = matchCallout(rawText);
		if (!callout) {
			return this.rendererBlockquote(token);
		}
		const calloutType = callout.toLowerCase();
		const title = getCalloutTitle(callout, rawText);
		const index = rawText.indexOf("\n");
		let body = "";
		if (index > 0) {
			const bodyText = rawText.slice(index + 1).trim();
			if (bodyText) {
				body = await this.marked.parse(bodyText);
			}
			if (!body && bodyText) {
				const inline = await this.marked.parseInline(bodyText);
				body = inline.replace(/\n/gm, "<br>");
			}
			body = wrapCalloutParagraphs(body);
		}
		const info = calloutIcons.get(calloutType) || calloutIcons.get("note");
		const icon = info ? info.icon : "";
		return `<section class="one2mp-callout" data-callout="${calloutType}"><div class="callout-title"><div class="callout-icon">${icon}</div><div class="callout-title-inner">${title}</div></div><div class="callout-content">${body}</div></section>`;
	}

	markedExtension(): MarkedExtension {
		return {
			async: true,
			walkTokens: async (token: Tokens.Generic) => {
				if (token.type !== "blockquote") {
					return;
				}
				const blockquote = token as Tokens.Blockquote;
				const raw = blockquote.raw || "";
				const rawText = normalizeBlockquoteText(raw);
				if (!blockquote.text && rawText) {
					blockquote.text = rawText;
				}
				const matched = matchCallout(rawText || blockquote.text);
				if (matched) {
					token.html = await this.rendererCallout(blockquote);
				} else {
					token.html = await this.rendererBlockquote(blockquote);
				}
			},
			extensions: [
				{
					name: "blockquote",
					level: "block",
					renderer: (token: Tokens.Generic) => {
						return token.html;
					},
				},
			],
		};
	}
}
