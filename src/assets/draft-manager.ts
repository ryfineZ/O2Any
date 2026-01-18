/**
 * Draft Manager 
 * 
 * - manage the local parameters for WeChat Article rendering parameters
 * - support multi-account switch
 * 
 */

import One2MpPlugin from "src/main";
import { Platform } from "obsidian";
import { areObjectsEqual } from "src/utils/utils";
import { $t } from "src/lang/i18n";
 
type DraftDb = {
	get: (id: string) => Promise<LocalDraftItem & { _rev?: string }>;
	put: (doc: LocalDraftItem & { _id: string }) => Promise<unknown>;
};



export type LocalDraftItem = {
    accountName?: string;
    notePath?: string; //obsidan file path for the note. 
    theme?: string; // the theme selected for rendering. missing will use default theme.
    cover_image_url?: string; // the cover image url for the article. could be a obsidian file path or url 
    _id?: string;
    _rev?: string;
    title: string;
    author?: string;
    digest?: string;
    content?: string;
    content_source_url?: string;
    thumb_media_id?: string;
    show_cover_pic?: number;
    need_open_comment?: number;
    only_fans_can_comment?: number;
    pic_crop_235_1?: string; //X1_Y1_X2_Y2, 用分隔符_拼接为X1_Y1_X2_Y2  
    pic_crop_1_1?: string; //X1_Y1_X2_Y2, 用分隔符_拼接为X1_Y1_X2_Y2
    cover_crop_scale?: number;
    cover_crop_offset_x?: number;
    cover_crop_offset_y?: number;
    cover_crop_ref?: string;
    last_draft_url?: string; //	草稿的临时链接
    last_draft_id?: string; //

}

// 草稿本地数据库：按账号 + 笔记路径存储发布元信息
let draftDb: DraftDb | null = null;

const loadDraftDb = async (): Promise<DraftDb | null> => {
	if (draftDb) {
		return draftDb;
	}
	try {
		const { default: PouchDB } = await import("pouchdb");
		const { default: PouchDBFind } = await import("pouchdb-find");
		PouchDB.plugin(PouchDBFind);
		draftDb = new PouchDB("one2mp-local-drafts");
		return draftDb;
	} catch (error) {
		console.warn("PouchDB 初始化失败，改用内存草稿存储", error);
		return null;
	}
};

export const initDraftDB = async (): Promise<void> => {
	await loadDraftDb();
};
export class LocalDraftManager {
    private plugin: One2MpPlugin;
    private db: DraftDb | null = null;
	private fallbackDrafts: Record<string, LocalDraftItem> = {};
	private fallbackLoaded = false;
    private static instance: LocalDraftManager | null = null;
    private constructor(plugin: One2MpPlugin) {
        this.plugin = plugin;
    }
    public static getInstance(plugin: One2MpPlugin): LocalDraftManager {
        if (!LocalDraftManager.instance) {
            LocalDraftManager.instance = new LocalDraftManager(plugin);
        }
        return LocalDraftManager.instance;
    }
	public static resetInstance() {
		LocalDraftManager.instance = null;
	}
	private async ensureFallbackLoaded() {
		if (this.fallbackLoaded) {
			return;
		}
		try {
			const data = (await this.plugin.loadData()) as Record<string, unknown> | null;
			const drafts = data?.local_drafts;
			if (drafts && typeof drafts === "object") {
				this.fallbackDrafts = drafts as Record<string, LocalDraftItem>;
			}
		} catch (error) {
			console.warn("加载本地草稿缓存失败", error);
		} finally {
			this.fallbackLoaded = true;
		}
	}

	private async saveFallbackDrafts() {
		try {
			const data = (await this.plugin.loadData()) as Record<string, unknown> | null;
			await this.plugin.saveData({
				...(data ?? {}),
				local_drafts: this.fallbackDrafts,
			});
		} catch (error) {
			console.warn("保存本地草稿缓存失败", error);
		}
	}

	private async getDb(): Promise<DraftDb | null> {
		if (this.db !== null) {
			return this.db;
		}
		if (Platform.isMobile) {
			return null;
		}
		this.db = await loadDraftDb();
		return this.db;
	}
    public async getDrafOfActiveNote() {
        let draft: LocalDraftItem | undefined

        const accountName = this.plugin.settings.selectedMPAccount;
        if (accountName !== undefined && accountName) {
            const f = this.plugin.app.workspace.getActiveFile()
			
            if (f) {
                draft = await this.getDraft(accountName, f.path)
				
                if (draft === undefined) {
                    draft = {
                        accountName: accountName,
                        notePath: f.path,
                        title: f.basename,
                        _id: accountName + f.path
                    }
                    await this.setDraft(draft)

                }
				if (draft.title.trim() === ''){
					draft.title = f.basename
					await this.setDraft(draft)
				}
            }
        }
        return draft
    }
    public isActiveNoteDraft(draft: LocalDraftItem | undefined) {
        const activeFile = this.plugin.app.workspace.getActiveFile()
        if (draft === undefined && activeFile === null) {
            return true
        }
        if (draft !== undefined && activeFile) {
            return draft.notePath === activeFile.path
        }
        return false
    }
    public async getDraft(accountName: string, notePath: string): Promise<LocalDraftItem | undefined> {
		const db = await this.getDb();
		if (!db) {
			await this.ensureFallbackLoaded();
			return this.fallbackDrafts[accountName + notePath];
		}
		return new Promise((resolve) => {
			db.get(accountName + notePath)
				.then((doc) => {
					resolve(doc as LocalDraftItem)
				})
				.catch(() => {
					resolve(undefined)
				})

		})
    }

    public async setDraft(doc: LocalDraftItem): Promise<boolean> {
        const toError = (err: unknown): Error =>
            err instanceof Error ? err : new Error(String(err));
		const db = await this.getDb();
		if (!db) {
			await this.ensureFallbackLoaded();
			if (!doc.accountName || !doc.notePath) {
				throw new Error($t('assets.invalid-draft'));
			}
			if (!doc._id) {
				doc._id = doc.accountName + doc.notePath;
			}
			const existing = this.fallbackDrafts[doc._id];
			if (existing && areObjectsEqual(doc, existing)) {
				return true;
			}
			this.fallbackDrafts[doc._id] = { ...doc };
			await this.saveFallbackDrafts();
			return true;
		}

        return new Promise((resolve, reject) => {
            if (!doc.accountName || !doc.notePath) {
                return reject(new Error($t('assets.invalid-draft')));
            }

            if (!doc._id) {
                doc._id = doc.accountName + doc.notePath;
            }

            db.get(doc._id)
                .then(existedDoc => {
                    const existingDraft = existedDoc as LocalDraftItem;
                    if (areObjectsEqual(doc, existingDraft)) {
                        // No changes needed
                        resolve(true);
                        return;
                    }
                    else {
                        doc._rev = existedDoc._rev;
                        return db.put(doc as LocalDraftItem & { _id: string })
                            .then(() => resolve(true))
                            .catch(() => {
                                resolve(false);
                            });
                    }
                    // No changes needed
                    resolve(false);
                })
                .catch(error => {
                    if (error.status === 404) {
                        // New document
                        return db.put(doc as LocalDraftItem & { _id: string })
                            .then(() => resolve(true))
                            .catch(err => {
                                console.error('Error creating new draft:', err);
                                reject(toError(err));
                            });
                    }
                    console.error('Error checking existing draft:', error);
                    reject(toError(error));
                });
        });
    }
}
