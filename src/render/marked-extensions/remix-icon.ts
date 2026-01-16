
/*
* marked extension for remixIcon svg icons:

*/
import { MarkedExtension } from "marked";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { One2MpMarkedExtension } from "./extension";

const remixIconRegex = /`(ris|fas):([a-z0-9-]+)`/i;
const remixIconRegexTokenizer = /^`(ris|fas):([a-z0-9-]+)`/i;
export class RemixIconRenderer extends One2MpMarkedExtension {
	remixIndex: number = 0;

	prepare(): Promise<void> {
		this.remixIndex = 0;
		return Promise.resolve();
	}


	render(): string {
		const root = ObsidianMarkdownRenderer.getInstance(this.plugin.app).queryElement(this.remixIndex, '.obsidian-icon.react-icon')
		if (!root) {
			return '<span>remix icon not found </span>';
		}
		this.remixIndex++
		return root.outerHTML;
	}



	markedExtension():MarkedExtension {
		return {
			extensions: [{
				name: 'remixIcon',
				level: 'inline',
				start: (str: string) => {
					const match = str.match(remixIconRegex);
					if (match){
						return match.index
					}
				},
				tokenizer: (src: string) => {
					const match = src.match(remixIconRegexTokenizer);
					if (match) {
						return {
							type: 'remixIcon',
							raw: match[0],
							text: match[0].trim(),
							lang: match[1],
						};
					}
				},
				renderer: () => {
					return this.render();
				},
			}]
		}
	}
}
