export class MpcardDataManager {
	private cardData: Map<string, string>;
	private static instance: MpcardDataManager;

	private constructor() {
		this.cardData = new Map<string, string>();
	}

	public static getInstance(): MpcardDataManager {
		if (!MpcardDataManager.instance) {
			MpcardDataManager.instance = new MpcardDataManager();
		}
		return MpcardDataManager.instance;
	}

	public setCardData(id: string, cardData: string) {
		this.cardData.set(id, cardData);
	}

	public cleanup() {
		this.cardData.clear();
	}

	public restoreCard(html: string) {
		for (const [key, value] of this.cardData.entries()) {
			const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const exp = `<section[^>]*\\sdata-id="${escapedKey}"[^>]*>(.*?)<\\/section>`;
			const regex = new RegExp(exp, "gs");
			if (!regex.test(html)) {
				console.warn("没有公众号信息：", key);
				continue;
			}
			html = html.replace(regex, value);
		}
		return html;
	}
}
