/*
manage the wechat account settings

*/
import { Plugin } from "obsidian";

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
	themeDownloadOverwrite: boolean;
};

type One2MpDataFile = {
	settings?: One2MpSetting;
	custom_theme_folder?: string;
	settings_version?: number;
};

const SETTINGS_VERSION = 1;

export const initOne2MpDB = async (): Promise<void> => {};

// 读取配置（优先 data.json）
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
		return undefined;
	} catch (error) {
		console.error("Error loading One2MpSetting:", error);
		return undefined;
	}
};

// 保存配置到 data.json
export const saveOne2MpSetting = async (
	plugin: Plugin,
	doc: One2MpSetting
): Promise<void> => {
	try {
		const data = (await plugin.loadData()) as One2MpDataFile | undefined;
		const existing = data?.settings;
		if (existing && JSON.stringify(doc) == JSON.stringify(existing)) {
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
