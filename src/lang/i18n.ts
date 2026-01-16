/**
 * i18n module for One2Mp plugin
 */
import i18n from "i18next";
import { moment } from "obsidian";

import enUsTrans from "./locales/en-us.json";
import zhCnTrans from "./locales/zh-cn.json";
declare global {
	interface Window {
		$t: (key: string, options?: string[]) => string;
	}
}
void i18n.init({
	debug: false,
	lng: moment.locale(), //obsidian language
	fallbackLng: "en", 
	interpolation: {
		escapeValue: false, 
	},
	resources: {
		en: {
			translation: enUsTrans,
		},
		zh: {
			translation: zhCnTrans,
		},
	},
}).catch((error) => {
	console.error("i18n init failed:", error);
});
export function $t(key: string, options?: string[]) {
	let result = i18n.t(key);
	if (options !== undefined) {
		for (let i = 0; i < options.length; i++) {
			result = result.replace(`{${i}}`, options[i]);
		}
	}
	return result;
}

window.$t = $t;

export default i18n;
