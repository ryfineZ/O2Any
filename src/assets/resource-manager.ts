/*
* Access to active MarkdownView for rendering resource.
  
  
 */

import { MarkdownView, requestUrl } from 'obsidian';
import One2MpPlugin from 'src/main';

export class ResourceManager {
    private static instance: ResourceManager;
    private plugin: One2MpPlugin;
    private constructor(plugin: One2MpPlugin) {
        this.plugin = plugin;
        this.init();
    }
    static getInstance(plugin: One2MpPlugin) {
        if (!this.instance) {
            this.instance = new ResourceManager(plugin);
        }
        return this.instance;
    }
    private init() {
    }
    public getCurrentMarkdownView() {
        const currentFile = this.plugin.app.workspace.getActiveFile();
        const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
        for (let leaf of leaves) {
            const markdownView = leaf.view as MarkdownView;
            if (markdownView.file?.path === currentFile?.path) {
                return markdownView;
            }
        }
        return null
    }
    public forceRenderActiveMarkdownView() {
        const view = this.getCurrentMarkdownView();
        if (view) {
            this.plugin.app.workspace.trigger('render', view)
        }
    }
    public queryElements(query: string) {
        const view = this.getCurrentMarkdownView();
        if (!view) return [];

        const view_query = view.getMode() === 'preview' ? '.markdown-preview-view' : '.markdown-source-view';
        const preview = view.containerEl.querySelector(view_query)

        if (!preview) {
            return []

        }
        return preview.querySelectorAll<HTMLElement>(query);
    }
    public getMarkdownViewContainer() {
        const view = this.getCurrentMarkdownView();

        if (!view) return null;
        return view.containerEl;
    }
    public getMarkdownRenderedElement(index: number, query: string) {
        const containers = this.queryElements(query);
        if (containers.length <= index) {
            return null;
        }
        const root = containers[index];
        if (!root) {
            return null;
        }
        return root;
    }
    public getFileOfLink(link: string) {
        const file = this.plugin.app.metadataCache.getFirstLinkpathDest(link, '');
        return file;
    }
    public async getLinkFileContent(link: string) {
        const tf = this.getFileOfLink(link);
        if (tf) {
            const content = await this.plugin.app.vault.adapter.read(tf.path);
            return content
        }
        return null
    }

    public async saveImageFromUrl(url: string): Promise<string | null> {
        const currentFile = this.plugin.app.workspace.getActiveFile();
        if (!currentFile) return null;

        // Get note basename and folder
        const noteBasename = currentFile.basename;
        const folderPath = currentFile.parent?.path || '';

        // Extract filename and extension from URL
        const urlParts = url.split('/');
        const filenameWithExt = urlParts[urlParts.length - 1].split('?')[0];
        const ext = filenameWithExt.split('.').pop();

        // Generate timestamp
        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_');

        // Create new filename
        const newFilename = `${noteBasename}_generated_${timestamp}.${ext || 'jpg'}`;
        const fullPath = folderPath === '/' ? `/${newFilename}`:`${folderPath}/${newFilename}`;
        try {
            // Fetch image using Obsidian's requestUrl
            const response = await requestUrl({url});
            if (response.status !== 200) throw new Error('Failed to fetch image');
            
            // Get ArrayBuffer from response
            const arrayBuffer = response.arrayBuffer;
            
            // Save to vault
            await this.plugin.app.vault.adapter.writeBinary(fullPath, arrayBuffer);
            
            return fullPath;
        } catch (error) {
            console.error('Error saving image:', error);
            return null;
        }
    }
}
