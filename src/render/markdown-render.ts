/**
 * MarkdownRender of obsidian. 
 * credits to author of export as image plugin
*/

import { App, Component, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
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
   
	private svgToDataUrl(svg: SVGElement, width?: number, height?: number): string {
		const clone = svg.cloneNode(true) as SVGElement;
		if (!clone.getAttribute("xmlns")) {
			clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		}
		if (width) {
			clone.setAttribute("width", String(width));
		}
		if (height) {
			clone.setAttribute("height", String(height));
		}
		let finalWidth = width;
		let finalHeight = height;
		if (!finalWidth || !finalHeight) {
			const rect = svg.getBoundingClientRect();
			finalWidth = finalWidth || Math.round(rect.width);
			finalHeight = finalHeight || Math.round(rect.height);
		}
		if (!finalWidth || !finalHeight) {
			const viewBox = (svg as SVGSVGElement).viewBox?.baseVal;
			if (viewBox && viewBox.width && viewBox.height) {
				finalWidth = finalWidth || Math.round(viewBox.width);
				finalHeight = finalHeight || Math.round(viewBox.height);
			}
		}
		if (finalWidth && !clone.getAttribute("width")) {
			clone.setAttribute("width", String(finalWidth));
		}
		if (finalHeight && !clone.getAttribute("height")) {
			clone.setAttribute("height", String(finalHeight));
		}

		const serialized = new XMLSerializer().serializeToString(clone);
		const encoder = new TextEncoder();
		const uint8Array = encoder.encode(serialized);
		let binary = "";
		for (const byte of uint8Array) {
			binary += String.fromCharCode(byte);
		}
		const base64 = btoa(binary);
		return `data:image/svg+xml;base64,${base64}`;
	}
	private async loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = (error) => {
				const message =
					error instanceof Error
						? error.message
						: typeof error === "string"
								? error
								: JSON.stringify(error);
				reject(new Error(message));
			};
			img.src = src;
		});
	}

	private async svgToPngDataUrl(svg: SVGElement, width?: number, height?: number): Promise<string> {
		const svgDataUrl = this.svgToDataUrl(svg, width, height);
		const image = await this.loadImage(svgDataUrl);
		const canvas = document.createElement('canvas');
		const dpr = window.devicePixelRatio || 1;
		canvas.width = image.width * dpr;
		canvas.height = image.height * dpr;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('无法获取 Canvas 上下文');
		}
		ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/png');
	}


	private async elementToDataUrl(
		element: Element,
		options: Record<string, unknown> = {}
	): Promise<string | null> {
		if (element instanceof HTMLCanvasElement) {
			return element.toDataURL("image/png");
		}

		if (element instanceof HTMLImageElement && element.src) {
			return element.src;
		}

		const canvas = element.querySelector("canvas");
		if (canvas instanceof HTMLCanvasElement) {
			return canvas.toDataURL("image/png");
		}

		const img = element.querySelector("img");
		if (img instanceof HTMLImageElement && img.src) {
			return img.src;
		}

		const svg = element instanceof SVGElement ? element : element.querySelector("svg");
		if (svg instanceof SVGElement) {
			const width = typeof options.width === "number" ? options.width : undefined;
			const height = typeof options.height === "number" ? options.height : undefined;
			return await this.svgToPngDataUrl(svg, width, height);
		}

		return null;
	}


	public async domToImage(
		element: Element,
		options: Record<string, unknown> = {}
	): Promise<string> {
		const dataUrl = await this.elementToDataUrl(element, options);
		if (!dataUrl) {
			throw new Error("无法生成元素截图数据");
		}
		return dataUrl;
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
