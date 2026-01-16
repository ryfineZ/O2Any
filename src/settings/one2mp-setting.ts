/*
manage the wechat account settings

*/
import { Plugin } from "obsidian";
import PouchDB from "pouchdb";
import { areObjectsEqual } from "src/utils/utils";

export type WeChatAccountInfo = {
    _id?: string;
    accountName: string;
    appId: string;
    appSecret: string;
    access_token?: string;
    expires_in?: number;
    lastRefreshTime?: number;
    isTokenValid?: boolean;
    doc_id?: string;
    mpcardHtml?: string;
}

export type One2MpSetting = {
	useCenterToken: boolean;
    realTimeRender: boolean;
    previewer_wxname?: string;
    custom_theme?: string;
    codeLineNumber: boolean;
    css_styles_folder: string;
    _id?: string; // = 'one2mp-setting';
    _rev?: string;
    ipAddress?: string;
    selectedMPAccount?: string;
    mpAccounts: Array<WeChatAccountInfo>;
    accountDataPath: string;
    defaultMpcard?: string;
    defaultMpcardId?: string;
    defaultMpcardHeadimg?: string;
    defaultMpcardNickname?: string;
    defaultMpcardSignature?: string;
};

type One2MpDataFile = {
	settings?: One2MpSetting;
	custom_theme_folder?: string;
	settings_version?: number;
};

// 使用 PouchDB 作为旧配置存储（迁移后保留数据，不做删除）
export const initOne2MpDB = (): PouchDB.Database<One2MpSetting> => {
	return new PouchDB<One2MpSetting>("one2mp-settings");
};
// Create a new database
const db = initOne2MpDB();


const SETTINGS_VERSION = 1;

// 读取旧配置文档（不存在则返回 undefined）
const getLegacySetting = async (): Promise<One2MpSetting | undefined> => {
	return new Promise((resolve) => {
		db.get("one2mp-settings")
			.then((doc: One2MpSetting) => {
				resolve(doc);
			})
			.catch((error: unknown) => {
				console.warn("Error getting One2MpSetting:", error);
				resolve(undefined);
			});
	});
};

// 读取配置（优先 data.json，必要时从旧 PouchDB 迁移）
export const getOne2MpSetting = async (
	plugin: Plugin
): Promise<One2MpSetting | undefined> => {
	try {
		const data = (await plugin.loadData()) as One2MpDataFile | undefined;
		if (data?.settings) {
			if (data.custom_theme_folder && !data.settings.css_styles_folder) {
				data.settings.css_styles_folder = data.custom_theme_folder;
			}
			return data.settings;
		}
		const legacy = await getLegacySetting();
		if (legacy) {
			const nextData: One2MpDataFile = {
				...data,
				settings: legacy,
				custom_theme_folder:
					legacy.css_styles_folder ?? data?.custom_theme_folder,
				settings_version: SETTINGS_VERSION,
			};
			await plugin.saveData(nextData);
		}
		return legacy;
	} catch (error) {
		console.error("Error loading One2MpSetting:", error);
		return undefined;
	}
};

// 保存配置到 data.json（保留旧 PouchDB 数据）
export const saveOne2MpSetting = async (
	plugin: Plugin,
	doc: One2MpSetting
): Promise<void> => {
	try {
		const data = (await plugin.loadData()) as One2MpDataFile | undefined;
		const existing = data?.settings;
		if (existing && areObjectsEqual(doc, existing)) {
			return;
		}
		const nextData: One2MpDataFile = {
			...data,
			settings: doc,
			custom_theme_folder: doc.css_styles_folder ?? data?.custom_theme_folder,
			settings_version: SETTINGS_VERSION,
		};
		await plugin.saveData(nextData);
	} catch (error) {
		console.error("Error setting One2MpSetting:", error);
	}
};
