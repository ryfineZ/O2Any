/*
* marked extension for codespan
- special codespan
- image caption

 */



import { Tokens } from "marked";
import { One2MpMarkedExtension } from "./extension";
export class CodespanRenderer extends One2MpMarkedExtension {
	showLineNumber: boolean;
	mermaidIndex: number = 0;
	admonitionIndex: number = 0;
	chartsIndex: number = 0;

	extractOne2MpCaptions(input: string): string[] {
		// const regex = /wwcap:\s*(.+?)(?=\s|$)/gi;
		const regex = /^wwcap:\s*(.*)$/gim;
		const captions: string[] = [];
		let match: RegExpExecArray | null;
		
		while ((match = regex.exec(input)) !== null) {
			captions.push(match[1].trim());
		}

		return captions;
	}

	codespanRenderer(code: string): string {
		code = code.trim();
		const captions = this.extractOne2MpCaptions(code);
		if (captions.length > 0) {
			return `<div class="one2mp-image-caption">${captions[0]}</div>`
		}
		return `<span class="one2mp-codespan">${code}</span>`;
	}


	markedExtension() {
		return {
			extensions: [{
				name: 'codespan',
				level: 'inline',
				renderer: (token: Tokens.Generic) => {
					return token.html;
				},
			}
			],
			walkTokens: (token: Tokens.Generic) => {
				if (token.type === 'codespan') {
					token.html = this.codespanRenderer(token.text);
				}
			}
		}
	}
}
