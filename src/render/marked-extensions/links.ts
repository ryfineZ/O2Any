/**
 * marked extension for footnote
 * 
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { One2MpMarkedExtension } from "./extension";

export class Links extends One2MpMarkedExtension {

    allLinks: Array<{ href: string; text: string }> = [];
    prepare(): Promise<void> {
        this.allLinks = [];
        return Promise.resolve();
    }

    postprocess(html: string): Promise<string> {
        if (!this.allLinks.length) {
            return Promise.resolve(html);
        }
        // 去重但保持顺序，同时尽量保留更有信息量的描述
        const uniqueLinks: Array<{ href: string; text: string }> = [];
        const seen = new Map<string, { href: string; text: string }>();
        for (const link of this.allLinks) {
            const existing = seen.get(link.href);
            if (!existing) {
                const item = { href: link.href, text: link.text };
                seen.set(link.href, item);
                uniqueLinks.push(item);
                continue;
            }
            const currentText = existing.text?.trim() || "";
            const nextText = link.text?.trim() || "";
            const preferNext =
                nextText &&
                nextText !== link.href &&
                (currentText === link.href || nextText.length > currentText.length);
            if (preferNext) {
                existing.text = nextText;
            }
        }
        const links = uniqueLinks.map((link) => {
            const text = link.text?.trim();
            const label = text && text !== link.href ? text : "外链";
            return `<li>${label}：<a data-linktype="2" data-link="${link.href}" href="${link.href}">${link.href}</a>&nbsp;↩</li>`;
        });
        return Promise.resolve(`${html}<section class="foot-links"><hr class="foot-links-separator"><ol>${links.join('')}</ol></section>`);
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [{
                name: 'link',
                level: 'inline',
                renderer: (token: Tokens.Link) => {
                    const escapeHtml = (value: string) =>
                        value
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/"/g, "&quot;")
                            .replace(/'/g, "&#39;");
                    if (token.href.startsWith('http')) {
                        const text = (token.text || "").trim();
                        const href = escapeHtml(token.href);
                        if (!text || text === token.href) {
                            return `<strong>(${href})</strong>`;
                        }
                        return `${escapeHtml(text)}<strong>(${href})</strong>`;
                    } else {
                        // 非http外链直接返回，不添加到foot-links中
                        return `<a href="${token.href}">${token.text}</a>`;
                    }
                    // else {
                    //     return `<a>${token.text}[${token.href}]</a>`;
                    // }
                }
            }]
        }
    }
}
