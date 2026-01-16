import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, StateField, Transaction } from "@codemirror/state";
import { Editor, sanitizeHTMLToDom } from 'obsidian';
import { RangeSetBuilder } from "@codemirror/state";
import { StateEffect } from "@codemirror/state";
import { $t } from "src/lang/i18n";

interface ProofItem {
    type: string;
    start: number;
    end: number;
    description: string;
    suggestion: string;
}

export class ProofService {
    private static instance: ProofService | null = null;
    private tooltip: HTMLElement | null = null;
    private activeItem: ProofItem | null = null;
    private proofField: StateField<DecorationSet>;
    private editorView: EditorView;
    private hideTimeoutId: number | null = null;

    private constructor(
        private editor: Editor,
        private proofItems: ProofItem[]
    ) {
        this.editorView = (this.editor as unknown as { cm: EditorView }).cm;
        this.setupProofField();
        this.setupEventListeners();
    }

    public static getInstance(editor: Editor, proofItems: ProofItem[]): ProofService {
        if (ProofService.instance) {
            ProofService.instance.destroy();
        }
        ProofService.instance = new ProofService(editor, proofItems);
        return ProofService.instance;
    }

    private setupProofField() {
        this.proofField = StateField.define<DecorationSet>({
            create: (state: EditorState) => {
                return this.createDecorations(state);
            },
            update: (decorations: DecorationSet, transaction: Transaction) => {
                if (transaction.docChanged) {
                    return this.createDecorations(transaction.state);
                }
                return decorations.map(transaction.changes);
            },
            provide: (field) => EditorView.decorations.from(field)
        });

        this.editorView.dispatch({
            effects: StateEffect.appendConfig.of([this.proofField])
        });
    }

    private createDecorations(state: EditorState): DecorationSet {
        void state;
        let builder = new RangeSetBuilder<Decoration>();
        
        this.proofItems.forEach((item, index) => {
            builder.add(
                item.start,
                item.end,
                Decoration.mark({
                    class: 'proof-underline',
                    attributes: { 'data-proof-id': index.toString() }
                })
            );
        });

        return builder.finish();
    }

    private setupEventListeners() {
        const dom = this.editorView.dom;
        dom.addEventListener('mouseover', this.handleMouseOver);
        dom.addEventListener('mouseout', this.handleMouseOut);
    }

    private handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('proof-underline')) {
            const proofId = parseInt(target.getAttribute('data-proof-id') || '-1');
            if (proofId >= 0) {
                this.showTooltip(this.proofItems[proofId], e);
            }
        }
    };

    private handleMouseOut = (e: MouseEvent) => {
        const relatedTarget = e.relatedTarget as HTMLElement;
        const tooltip = this.tooltip;
        
        if (relatedTarget?.closest('.proof-tooltip') || 
            tooltip?.contains(e.target as Node)) {
            if (this.hideTimeoutId) {
                window.clearTimeout(this.hideTimeoutId);
                this.hideTimeoutId = null;
            }
            return;
        }

        if (!this.hideTimeoutId) {
            this.hideTimeoutId = window.setTimeout(() => {
                this.hideTooltip();
                this.hideTimeoutId = null;
            }, 500);
        }
    };

    private showTooltip(item: ProofItem, e: MouseEvent) {
        if (this.hideTimeoutId) {
            window.clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }

        if (this.tooltip && this.activeItem === item) {
            return;
        }

        this.hideTooltip();
        this.activeItem = item;

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'proof-tooltip';
        
        const content = `
            <div class="proof-type">${item.type}</div>
            <div class="proof-description">${item.description}</div>
            <div class="proof-suggestion">${$t('modals.proof.suggestion')} ${item.suggestion}</div>
            <div class="proof-actions">
                <button class="proof-accept">${$t('modals.proof.accept')} </button>
                <button class="proof-reject">${$t('modals.proof.skip')} </button>
            </div>
        `;
		const dom = sanitizeHTMLToDom(content);

        this.tooltip.empty()
		this.tooltip.appendChild(dom); //.innerHTML = content;

        const rect = (e.target as HTMLElement).getBoundingClientRect();
        
        document.body.appendChild(this.tooltip);
        const tooltipHeight = this.tooltip.offsetHeight;
        const tooltipWidth = this.tooltip.offsetWidth;
        
        let top = rect.bottom + 5;
        if (top + tooltipHeight > window.innerHeight) {
            top = rect.top - tooltipHeight - 5;
        }
        
        let left = rect.left;
        if (left + tooltipWidth > window.innerWidth) {
            left = window.innerWidth - tooltipWidth - 5;
        }
        
        this.tooltip.setCssProps({
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
        });

        this.tooltip.addEventListener('mouseenter', () => {
            if (this.hideTimeoutId) {
                window.clearTimeout(this.hideTimeoutId);
                this.hideTimeoutId = null;
            }
        });

        this.tooltip.addEventListener('mouseleave', (e) => {
            if (!(e.relatedTarget as HTMLElement)?.closest('.proof-underline')) {
                this.handleMouseOut(e);
            }
        });

        this.tooltip.querySelector('.proof-accept')?.addEventListener('click', () => this.acceptSuggestion(item));
        this.tooltip.querySelector('.proof-reject')?.addEventListener('click', () => this.rejectSuggestion(item));
    }

    private hideTooltip() {
        if (this.hideTimeoutId) {
            window.clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
            this.activeItem = null;
        }
    }

    private acceptSuggestion(item: ProofItem) {
        const from = this.editor.offsetToPos(item.start);
        const to = this.editor.offsetToPos(item.end);
        
        this.editor.setSelection(from, to);
        this.editor.replaceSelection(item.suggestion);
        
        const lengthDiff = item.suggestion.length - (item.end - item.start);
        this.proofItems.forEach(proofItem => {
            if (proofItem.start > item.end) {
                proofItem.start += lengthDiff;
                proofItem.end += lengthDiff;
            }
        });
        
        this.removeProofItem(item);
    }

    private rejectSuggestion(item: ProofItem) {
        this.removeProofItem(item);
    }

    private removeProofItem(item: ProofItem) {
        const index = this.proofItems.indexOf(item);
        if (index > -1) {
            this.proofItems.splice(index, 1);
            this.editorView.dispatch({
                effects: StateEffect.reconfigure.of([this.proofField])
            });
        }
        this.hideTooltip();
    }

    public destroy() {
        this.hideTooltip();
        if (this.editorView) {
            this.editorView.dom.removeEventListener('mouseover', this.handleMouseOver);
            this.editorView.dom.removeEventListener('mouseout', this.handleMouseOut);
            this.editorView.dispatch({
                effects: StateEffect.reconfigure.of([])
            });
        }
    }
}

export function showProofSuggestions(editor: Editor, proofItems: ProofItem[]): ProofService {
    return ProofService.getInstance(editor, proofItems);
}
