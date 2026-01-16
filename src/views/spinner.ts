export  class Spinner { 
	private spinnerEl: HTMLElement;
	private spinnerText: HTMLDivElement;
	constructor(spinnerEl: HTMLElement) {
		this.spinnerEl = spinnerEl;
		this.spinnerEl.addClass("spinner-container");
		const dots = this.spinnerEl.createDiv({
			cls: "spinner-dots",
		});
		for (let i = 0; i < 6; i++) {
			const dot = dots.createDiv({
				cls: `spinner-dot spinner-dot${i + 1}`,
			});
			dot.setCssProps({ "animation-delay": `${i * 0.3}s` });
		}
		this.spinnerText = this.spinnerEl.createDiv({
			cls: "spinner-text"});
	}
	showSpinner(text: string = "") {
		this.spinnerEl.setCssProps({ display: "flex" });
		this.spinnerText.setText(text);
	}
	isSpinning() {
		return getComputedStyle(this.spinnerEl).display !== "none";
	}

	hideSpinner() {
		this.spinnerEl.setCssProps({ display: "none" });
	}
	unload() {
		this.spinnerEl.remove();
	}
}
