import { App } from 'obsidian';

export function getFrontmatter(app: App): Record<string, unknown> | null {
    const cache = app.metadataCache.getCache(''); 
    return cache?.frontmatter || null;
}

export function setFrontmatter(
	app: App,
	content: string,
	properties: Record<string, unknown>
): string {
    const cache = app.metadataCache.getCache('');
    const existingFrontmatter = cache?.frontmatter || {};
    const updatedFrontmatter = { ...existingFrontmatter, ...properties };
    
    const frontmatterString = Object.entries(updatedFrontmatter)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n');
    
    if (content.startsWith('---')) {
        return content.replace(/^---\n[\s\S]*?\n---/, `---\n${frontmatterString}\n---`);
    }
    return `---\n${frontmatterString}\n---\n${content}`;
}
