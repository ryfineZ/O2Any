import { Component } from "obsidian";

export class ComboBoxComponent extends Component {
    private container: HTMLElement;
    private input: HTMLInputElement;
    private datalist: HTMLDataListElement;
    private options: Set<string>;
    private onChangeCallback: (value: string) => void;

    constructor(parent: HTMLElement, options: string[] = [], onChange?: (value: string) => void) {
        super();
        this.container = parent;
        this.options = new Set(options);
        this.onChangeCallback = onChange || (() => {});

        this.createComboBox();
    }

    private createComboBox() {
        // 创建输入框
        this.input = document.createElement("input");
        this.input.setAttribute("list", "combo-options");
        this.input.placeholder = "输入或选择...";
        this.input.addEventListener("change", () => this.handleInputChange());

        // 创建 datalist
        this.datalist = document.createElement("datalist");
        this.datalist.id = "combo-options";
        this.updateOptions();

        this.container.appendChild(this.input);
        this.container.appendChild(this.datalist);
    }

    private handleInputChange() {
        const value = this.input.value.trim();
        if (value && !this.options.has(value)) {
            this.addOption(value);
        }
        this.onChangeCallback(value);
    }

    private updateOptions() {
        this.datalist.empty(); //.innerHTML = ""; // 清空已有选项
        this.options.forEach(option => {
            const optionElement = document.createElement("option");
            optionElement.value = option;
            this.datalist.appendChild(optionElement);
        });
    }

    public addOption(value: string) {
        this.options.add(value);
        this.updateOptions();
    }

    public setOptions(newOptions: string[]) {
        this.options = new Set(newOptions);
        this.updateOptions();
    }

    public getValue(): string {
        return this.input.value;
    }

    public setValue(value: string) {
        this.input.value = value;
    }
}
