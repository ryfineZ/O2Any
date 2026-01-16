import { App, Modal, Notice, Setting, TextAreaComponent } from "obsidian";
import One2MpPlugin from "src/main";
import { $t } from "src/lang/i18n";
import { WeChatAccountInfo } from "src/settings/one2mp-setting";
import { LocalDraftManager } from "src/assets/draft-manager";

export class PublishConfigModal extends Modal {
	plugin: One2MpPlugin;
	account: WeChatAccountInfo | undefined;
	
	constructor(app: App, plugin: One2MpPlugin) {
		super(app);
		this.plugin = plugin;
        this.updateCurrentAccount();
	}
    
    updateCurrentAccount() {
        const accountName = this.plugin.settings.selectedMPAccount;
        if (accountName) {
            this.account = this.plugin.getMPAccountByName(accountName);
        }
    }

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("one2mp-publish-modal");

		contentEl.createEl("h2", { text: $t("publish-config.title") });

        if (!this.account) {
            new Notice($t("wechat-api.select-an-wechat-mp-account-first"));
            this.close();
            return;
        }

		// Tab Navigation (Simple implementation)
        // For simplicity, we'll just stack sections for now, or use details
        
        this.renderMPCardSection(contentEl);
        this.renderOtherSettings(contentEl);
	}
    
    renderMPCardSection(container: HTMLElement) {
        const details = container.createEl("details", { cls: "one2mp-config-section" });
        details.open = true; // Default open
        details.createEl("summary", { text: $t("publish-config.mp-card-settings") });
        
        const content = details.createDiv({ cls: "one2mp-config-content" });
        
        // 1. Preview Area
        const previewContainer = content.createDiv({ cls: "one2mp-card-preview" });
        this.renderCardPreview(previewContainer);
        
        // 2. Parser Input
        const parserDiv = content.createDiv({ cls: "one2mp-card-parser" });
        parserDiv.createEl("p", { text: $t("publish-config.paste-html-guide"), cls: "setting-item-description" });
        
        const inputArea = new TextAreaComponent(parserDiv);
        inputArea.setPlaceholder("<mp-common-profile ... >");
        inputArea.inputEl.rows = 3;
        inputArea.inputEl.setCssProps({ width: "100%" });
        
        const btnDiv = parserDiv.createDiv({ cls: "one2mp-parser-actions" });
        const parseBtn = btnDiv.createEl("button", { text: $t("publish-config.parse-and-save") });
        parseBtn.onclick = () => {
             const html = inputArea.getValue();
             if (this.parseAndSaveCard(html)) {
                 inputArea.setValue(""); // clear
                 this.renderCardPreview(previewContainer); // refresh preview
                 new Notice($t("publish-config.card-updated"));
             } else {
                 new Notice($t("publish-config.parse-failed"));
             }
        };
        
        // 3. Manual Edit (Collapsed)
        const manualDetails = content.createEl("details", { cls: "one2mp-manual-edit" });
        manualDetails.createEl("summary", { text: $t("publish-config.manual-edit") });
        const manualContent = manualDetails.createDiv();
        
        this.renderManualFields(manualContent, previewContainer);
    }
    
    renderCardPreview(container: HTMLElement) {
        container.empty();
        const payload = this.plugin.settings.defaultMpcard;
        
        if (payload && payload.includes("```mpcard")) {
             const lines = payload.replace(/```mpcard|```/g, "").trim().split("\n");
             const data: Record<string, string> = {};
             lines.forEach(line => {
                 const [k, ...v] = line.split(":");
                 if(k && v) data[k.trim()] = v.join(":").trim();
             });
             
             const card = container.createDiv({ cls: "one2mp-mpcard-wrapper" });
             // Limit width to simulate mobile view and prevent overflow
             card.setCssProps({ "max-width": "100%" }); 
             
             const inner = card.createDiv({ cls: "one2mp-mpcard-content" });
             if(data.headimg) {
                 const img = inner.createEl("img", { cls: "one2mp-mpcard-headimg" });
                 img.src = data.headimg;
             }
             const info = inner.createDiv({ cls: "one2mp-mpcard-info" });
             info.createDiv({ cls: "one2mp-mpcard-nickname", text: data.nickname || "No Nickname" });
             info.createDiv({ cls: "one2mp-mpcard-signature", text: data.signature || "No Signature" });
             
        } else {
            container.createDiv({ text: $t("publish-config.mpcard-empty"), cls: "setting-item-description" });
        }
    }
    
    parseAndSaveCard(html: string): boolean {
        // Regex to extract data attributes
        const nicknameMatch = html.match(/data-nickname="([^"]*)"/);
        const headimgMatch = html.match(/data-headimg="([^"]*)"/);
        const signatureMatch = html.match(/data-signature="([^"]*)"/);
        const idMatch = html.match(/data-id="([^"]*)"/); // The hidden biz id
        // Alias is usually not in the standard profile html unless specific type, but let's try
        // We need at least nickname to consider it valid? Or just anything.
        if (!nicknameMatch && !headimgMatch) return false;

        if (nicknameMatch) this.plugin.settings.defaultMpcardNickname = nicknameMatch[1];
        if (headimgMatch) this.plugin.settings.defaultMpcardHeadimg = headimgMatch[1];
        if (signatureMatch) this.plugin.settings.defaultMpcardSignature = signatureMatch[1];
        if (idMatch) this.plugin.settings.defaultMpcardId = idMatch[1];
        
        this.saveSettings();
        return true;
    }
    
    saveSettings() {
        const lines: string[] = [];
        const id = this.plugin.settings.defaultMpcardId?.trim();
        const headimg = this.plugin.settings.defaultMpcardHeadimg?.trim();
        const nickname = this.plugin.settings.defaultMpcardNickname?.trim();
        const signature = this.plugin.settings.defaultMpcardSignature?.trim();
        
        if (id) lines.push(`id: ${id}`);
        if (headimg) lines.push(`headimg: ${headimg}`);
        if (nickname) lines.push(`nickname: ${nickname}`);
        if (signature) lines.push(`signature: ${signature}`);
        
        if (lines.length > 0) {
            this.plugin.settings.defaultMpcard = ["```mpcard", ...lines, "```"].join("\n");
        } else {
             this.plugin.settings.defaultMpcard = "";
        }
        
        this.plugin.saveSettings();
    }
    
    renderManualFields(container: HTMLElement, previewContainer: HTMLElement) {
         new Setting(container)
            .setName($t("settings.default-mpcard-nickname"))
            .setClass("one2mp-setting-wide")
            .addText(text => text
                .setValue(this.plugin.settings.defaultMpcardNickname || "")
                .onChange(v => {
                    this.plugin.settings.defaultMpcardNickname = v;
                    this.saveSettings();
                    this.renderCardPreview(previewContainer);
                }));
                
         new Setting(container)
            .setName($t("settings.default-mpcard-headimg"))
            .setClass("one2mp-setting-wide")
            .addText(text => text
                .setValue(this.plugin.settings.defaultMpcardHeadimg || "")
                .onChange(v => {
                    this.plugin.settings.defaultMpcardHeadimg = v;
                    this.saveSettings();
                    this.renderCardPreview(previewContainer);
                }));
                
         new Setting(container)
            .setName($t("settings.default-mpcard-signature"))
            .setClass("one2mp-setting-wide")
            .addTextArea(text => text
                .setValue(this.plugin.settings.defaultMpcardSignature || "")
                .setPlaceholder("...")
                .onChange(v => {
                    this.plugin.settings.defaultMpcardSignature = v;
                    this.saveSettings();
                    this.renderCardPreview(previewContainer);
                }));
            
            // Manual styling for TextArea to make it taller
            container.findAll("textarea").forEach(el => (el as HTMLTextAreaElement).rows = 4);
         
          new Setting(container)
            .setName($t("settings.default-mpcard-biz-id"))
            .setDesc($t("settings.default-mpcard-biz-id-desc"))
            .setClass("one2mp-setting-wide")
            .addText(text => text
                .setValue(this.plugin.settings.defaultMpcardId || "")
                .onChange(v => {
                    this.plugin.settings.defaultMpcardId = v;
                    this.saveSettings();
                }));
    }
    
    renderOtherSettings(container: HTMLElement) {
         const details = container.createEl("details", { cls: "one2mp-config-section" });
         details.createEl("summary", { text: $t("publish-config.other-settings") });
         const content = details.createDiv({ cls: "one2mp-config-content" });

         // Previewer WX Name
         const previewSetting = new Setting(content)
            .setName($t("settings.draft-previewer-wechat-id"))
            .setDesc($t("settings.draft-only-visible-for-the-wechat-user-o"))
            .addText(text => text
                .setValue(this.plugin.settings.previewer_wxname || "")
                .onChange(v => {
                    this.plugin.settings.previewer_wxname = v;
                    this.plugin.saveSettings();
                }));

         previewSetting.addButton(button => {
            button
                .setButtonText($t("views.preview-draft"))
                .setIcon("eye")
                .setTooltip($t("settings.preview-draft-tooltip"))
                .onClick(() => {
                    void (async () => {
                        if (!this.plugin.settings.previewer_wxname?.trim()) {
                            new Notice($t("views.previewer.preview-draft-missing-wxid"));
                            return;
                        }
                        const draft = await LocalDraftManager.getInstance(this.plugin).getDrafOfActiveNote();
                        const draftId = draft?.last_draft_id;
                        if (!draftId) {
                            new Notice($t("views.previewer.preview-draft-missing-id"));
                            return;
                        }
                        const ok = await this.plugin.wechatClient.senfForPreview(draftId);
                        if (ok) {
                            new Notice($t("views.previewer.preview-draft-sent"));
                        }
                    })();
                });
         });
    }

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
