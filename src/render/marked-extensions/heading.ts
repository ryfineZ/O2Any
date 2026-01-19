/**
 * marked extension for heading
 * 
 * credits to Sun BooShi, author of note-to-mp plugin
 */

import { MarkedExtension } from "marked";
import { One2MpMarkedExtension } from "./extension";
import { sanitizeHTMLToDom } from "obsidian";
import { serializeChildren } from "src/utils/utils";

export class Heading extends One2MpMarkedExtension {
	postprocess(html: string): Promise<string> {
		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
		for (const heading of headings) {
			const text = heading.textContent
			heading.empty()
			heading.createSpan({ text: " ", cls: 'one2mp-heading-prefix' })
			const outbox = heading.createSpan({ cls: 'one2mp-heading-outbox' })
			outbox.createSpan({ text: text ? text : "", cls: 'one2mp-heading-leaf' })
			heading.createSpan({ cls: 'one2mp-heading-tail' })
		}
		return Promise.resolve(serializeChildren(tempDiv))

	}

	// async render(text: string, depth: number) {
	// 	console.log('heading=>', text);

	// 	return `
    //         <h${depth}>
	// 		<span class="one2mp-heading-prefix">
	// 		${depth}
	// 		  </span>
	// 		<span class="one2mp-heading-outbox">
	// 		<span class="one2mp-heading-leaf">
    //           ${text}
	// 		  </span>
	// 		  </span>
	// 		  <span class="one2mp-heading-tail">
	// 		  </span>
    //         </h${depth}>`;

	// }

	markedExtension(): MarkedExtension {
		return {
			extensions: []
		}
		// 	return {
		// 		async: true,
		// 		walkTokens: async (token: Tokens.Generic) => {
		// 			if (token.type !== 'heading') {
		// 				return;
		// 			}
		// 			token.html = await this.render(token.text, token.depth);
		// 		},
		// 		extensions: [{
		// 			name: 'heading',
		// 			level: 'block',

		// 			renderer(token: Tokens.Generic) {
		// 				return token.html;
		// 			}
		// 		}]
		// 	}
		// }
	}
}
