/*
* marked extension for math:
 use mathjax to render math

  credits to Sun BooShi, author of note-to-mp plugin
  
 */

import { parseMath } from "../mathjax";
import { MarkedExtension, Tokens } from "marked";
import { One2MpMarkedExtension } from "./extension";

const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1/;
const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

export class MathRenderer extends One2MpMarkedExtension {
    
    renderer(token: Tokens.Generic, inline: boolean, type: string = '') {
        if (type === '') {
            type = 'InlineMath'
        }
        const svg = parseMath(token.text, !inline) 
        if (inline){
            return `<span  class="inline-math">${svg}</span>`;  
        }else{

            return `<section  class="block-math">${svg}</section>`;
        }
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [
                this.inlineMath(),
                this.blockMath()
            ]
        }
    }

    inlineMath() {
        return {
            name: 'InlineMath',
            level: 'inline',
            start(src: string) {

                // 
                let index;
                let indexSrc = src;

                while (indexSrc) {
                    index = indexSrc.indexOf('$');
                    if (index === -1) {
                        // no '$' in the string
                        return;
                    }

                    const possibleKatex = indexSrc.substring(index);

                    //from the index, check if match the inline rule
                    if (possibleKatex.match(inlineRule)) {
                        return index;
                    }

                    indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
                }
            },
            tokenizer(src: string) {
                const match = src.match(inlineRule);
                if (match) {
                    return {
                        type: 'InlineMath',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2
                    };
                }
            },
            renderer: (token: Tokens.Generic) => {
               return this.renderer(token, true);
            }
        }
    }
    blockMath() {
        return {
            name: 'BlockMath',
            level: 'block',
            tokenizer(src: string) {
                const match = src.match(blockRule);
                if (match) {
                    return {
                        type: 'BlockMath',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2
                    };
                }
            },
            renderer: (token: Tokens.Generic) => {
                return this.renderer(token, false);
            }
        };
    }
}
