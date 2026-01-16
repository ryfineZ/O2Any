/**
 * MarkdownRender of obsidian. 
 * credits to author of export as image plugin
*/

import { App, Component, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import domtoimage from './dom-to-image-more';
export class ObsidianMarkdownRenderer {
    private static instance: ObsidianMarkdownRenderer;
    previewEl: HTMLElement
    private rendering: boolean = false
    private container: HTMLElement
    private view: Component
    mdv: MarkdownRenderChild;
    markdownBody: HTMLDivElement;
    private constructor(private app: App) {
        this.app = app;
    }

    public static getInstance(app: App,) {
        if (!ObsidianMarkdownRenderer.instance) {
            ObsidianMarkdownRenderer.instance = new ObsidianMarkdownRenderer(app);
        }
        return ObsidianMarkdownRenderer.instance;
    }
    public async render(path: string, container?: HTMLElement, view?: Component) {
        // 使用 Obsidian 自带渲染器生成 DOM（用于处理内部链接/嵌入等）
        if (path === undefined || !path || !path.toLowerCase().endsWith('.md')) {
            return;
        }
        if (!container || !view) {
            return;
        }
	
        this.container = container
        this.container.addClass('one2mp-markdown-render-container')
        this.view = view
        // if (this.previewEl !== undefined && this.previewEl) {
        //     this.previewEl.parentNode?.removeChild(this.previewEl)
        // }
		this.container.empty();
		this.container.show();
        this.rendering = true
        if (this.mdv) {
            this.mdv.unload();
        }
        // await this.loadComponents(view)
        this.previewEl = createDiv()
        this.markdownBody = this.previewEl.createDiv()
        this.mdv = new MarkdownRenderChild(this.markdownBody)
        this.view.addChild(this.mdv)
        this.container.appendChild(this.previewEl)
        const markdown = await this.app.vault.adapter.read(path)
        await MarkdownRenderer.render(this.app, markdown, this.markdownBody, path, this.mdv
			// this.app.workspace.getActiveViewOfType(MarkdownView)!
            // || this.app.workspace.activeLeaf?.view
            // || this.mdv //new MarkdownRenderChild(this.el)
        )
        try {
			// 等待异步渲染完成（如 callout/mermaid）
			const waiters: Promise<void>[] = [];
			if (/^\s*>+\s*\[!/m.test(markdown)) {
				waiters.push(this.waitForSelector(this.previewEl, ".callout", 1000));
			}
			if (/```\s*mermaid/i.test(markdown)) {
				waiters.push(
					this.waitForSelector(this.previewEl, ".mermaid svg", 5000)
				);
			}
			if (waiters.length) {
				await Promise.all(waiters);
			}
		} catch (err) {
			console.warn("部分插件渲染超时（非致命）", err);
		}
        this.rendering = false
		// this.container.hide() 
    }
    public queryElement(index: number, query: string) {
        if (this.previewEl === undefined || !this.previewEl) {
            return null
        }
        if (this.rendering) {
			return null
		}
		if (this.previewEl === undefined || !this.previewEl) {
            return null
        }
        const nodes = this.previewEl.querySelectorAll<HTMLElement>(query)
        if (index < 0 || index >= nodes.length) {
            return null
        }
        return nodes[index]
    }
   
    public async domToImage(
        element: Element,
        options: Record<string, unknown> = {}
    ): Promise<string> {
        return await domtoimage.toPng(element, options)
    }
	waitForSelector(
		container: HTMLElement,
		selector: string,
		timeout = 1000
	): Promise<void> {
		return new Promise((resolve) => {
			if (container.querySelector(selector)) return resolve();

			const observer = new MutationObserver(() => {
				if (container.querySelector(selector)) {
					observer.disconnect();
					resolve();
				}
			});

			observer.observe(container, { childList: true, subtree: true });

			setTimeout(() => {
				observer.disconnect();
				// reject(new Error(`Timeout waiting for selector: ${selector}`));
				resolve();
			}, timeout);
		});
	}

}
