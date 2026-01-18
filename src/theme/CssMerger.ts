/**
 * to build custom css for one2mp.
 * author: Learner Chen <learner.chen@icloud.com>
 * date: 2025-05-10
 */

import $00 from '../assets/default-styles/00_one2mp.css';
import $01 from '../assets/default-styles/01_layout.css';
import $02 from '../assets/default-styles/02_icons.css';
import $03 from '../assets/default-styles/03_typography.css';
import $04 from '../assets/default-styles/04_paragragh.css';
import $05 from '../assets/default-styles/05_strong.css';
import $06 from '../assets/default-styles/06_em.css';
import $07 from '../assets/default-styles/07_u.css';
import $08 from '../assets/default-styles/08_del.css';
import $09 from '../assets/default-styles/09_codespan.css';
import $10 from '../assets/default-styles/10_heading.css';
import $11  from '../assets/default-styles/11_h1.css';
import $12 from '../assets/default-styles/12_h2.css';
import $13 from '../assets/default-styles/13_h3.css';
import $14 from '../assets/default-styles/14_h4.css';
import $15 from '../assets/default-styles/15_h5.css';
import $16 from '../assets/default-styles/16_h6.css';
import $20 from '../assets/default-styles/20_image.css';
import $21 from '../assets/default-styles/21_list.css';
import $23 from '../assets/default-styles/23_footnote.css';
import $24 from '../assets/default-styles/24_table.css';
import $25 from '../assets/default-styles/25_code.css';
import $26 from '../assets/default-styles/26_blockquote.css';
import $27 from '../assets/default-styles/27_links.css';
import $30 from '../assets/default-styles/30_callout.css';
import $31 from '../assets/default-styles/31_admonition.css';
import $32 from '../assets/default-styles/32_math.css';
import $33 from '../assets/default-styles/33_mermaid.css';
import $34 from '../assets/default-styles/34_chart.css';
import $35 from '../assets/default-styles/35_icon.css';
import $40 from '../assets/default-styles/40_summary.css';
import $50 from '../assets/default-styles/50_profile.css';
import $60 from '../assets/default-styles/60_mpcard.css';
import { Notice } from 'obsidian';
import { $t } from 'src/lang/i18n';

// 默认主题样式按模块拆分，合并为基础样式表
const baseCSS = [
	$00,
	$01,
	$02,
	$03,
	$04,
	$05,
	$06,
	$07,
	$08,
	$09,
	$10,
	$11,
	$12,
	$13,
	$14,
	$15,
	$16,
	$20,
	$21,
	$23,
	$24,
	$25,
	$26,
	$27,
	$30,
	$31,
	$32,
	$33,
	$34,
	$35,
	$09,
	$40,
	$50,
	$60
]

// 微信编辑器保留类名，避免被自定义 CSS 覆盖
const RESERVED_CLASS_PREFIX = [
	'appmsg_',
	'wx_',
	'wx-',
	'common-webchat',
	'weui-'
]

const isClassReserved = (className: string) => {
	return RESERVED_CLASS_PREFIX.some(prefix => className.startsWith(prefix));
}

type RuleDecl = {
	value: string;
	important: boolean;
};
type Rule = Map<string, RuleDecl>;
type Rules = Map<string, Rule>;

export class CSSMerger {
	vars: Map<string, string> = new Map()
	rules: Rules = new Map()


	async init(customCSS: string) {
		// 先构建基础样式，再合并用户自定义规则/变量
		await this.buildBaseCSS();
		try {
			this.mergeCssText(customCSS);
		}catch(e) {
			new Notice($t('render.failed-to-parse-custom-css', [e]));
			console.error(e);
		}

	}
	async buildBaseCSS() {
		// 收集默认主题中的变量与规则
		this.vars.clear();
		this.rules.clear();
		for (const css of baseCSS) {
			this.mergeCssText(css);
		}
	}
	private resolveCssVars(value: string, vars: Map<string, string>, depth = 0): string {
		// 递归解析 var()，支持 fallback
		const MAX_DEPTH = 10; // 防止无限循环
		const varRegex = /var\(\s*--([\w-]+)(?:\s*,\s*((?:\((?:[^()]|\([^()]*\))*\)|[^)\s]|[\s\S])*?))?\s*\)/g;
		let result = value;
		let replaced: boolean;

		do {
			replaced = false;

			result = result.replace(varRegex, (_match, varName: string, fallback: string | undefined) => {

				const fullKey = `--${varName}`;
				if (vars.has(fullKey)) {
					const replacement = vars.get(fullKey)!;
					replaced = true;
					return replacement;
				} else if (fallback !== undefined) {
					replaced = true;
					return fallback;
				} else {
					console.warn(`Variable ${fullKey} not found and no fallback provided`);
					return '';
				}
			});

			depth++;
		} while (replaced && depth < MAX_DEPTH);

		return result;
	}

	private mergeCssText(cssText: string) {
		if (!cssText || !cssText.trim()) {
			return;
		}
		const parsed = this.parseCssText(cssText);
		this.mergeVars(parsed.vars);
		this.mergeRules(parsed.rules);
	}

	private mergeVars(vars: Map<string, string>) {
		for (const [key, value] of vars.entries()) {
			this.vars.set(key, value);
		}
	}

	private mergeRules(rules: Rules) {
		for (const [selector, ruleMap] of rules.entries()) {
			let selectedRule = this.rules.get(selector);
			if (!selectedRule) {
				selectedRule = new Map();
				this.rules.set(selector, selectedRule);
			}
			for (const [prop, decl] of ruleMap.entries()) {
				const baseDecl = selectedRule.get(prop);
				if (baseDecl === undefined || !baseDecl.important || decl.important) {
					selectedRule.set(prop, decl);
				}
			}
		}
	}

	private parseCssText(cssText: string): { vars: Map<string, string>; rules: Rules } {
		const vars = new Map<string, string>();
		const rules: Rules = new Map();
		const sheet = this.parseWithCssSheet(cssText);
		if (sheet) {
			this.collectRulesFromList(sheet.cssRules, vars, rules);
			return { vars, rules };
		}
		this.parseWithFallback(cssText, vars, rules);
		return { vars, rules };
	}

	private parseWithCssSheet(cssText: string): CSSStyleSheet | null {
		if (typeof CSSStyleSheet === "undefined") {
			return null;
		}
		const sheet = new CSSStyleSheet();
		try {
			sheet.replaceSync(cssText);
			return sheet;
		} catch (error) {
			console.debug("CSSStyleSheet 解析失败", error);
			return null;
		}
	}

	private collectRulesFromList(ruleList: CSSRuleList, vars: Map<string, string>, rules: Rules) {
		for (const rule of Array.from(ruleList)) {
			if (rule.type === CSSRule.STYLE_RULE) {
				this.collectStyleRule(rule as CSSStyleRule, vars, rules);
			} else if ("cssRules" in rule) {
				this.collectRulesFromList((rule as CSSMediaRule).cssRules, vars, rules);
			}
		}
	}

	private collectStyleRule(styleRule: CSSStyleRule, vars: Map<string, string>, rules: Rules) {
		if (!styleRule.selectorText) {
			return;
		}
		const selectors = styleRule.selectorText
			.split(",")
			.map((selector) => selector.trim())
			.filter(Boolean);
		if (selectors.length === 0) {
			return;
		}
		for (const selector of selectors) {
			if (selector === ":root") {
				this.collectVariables(styleRule.style, vars);
				continue;
			}
			this.collectDeclarations(selector, styleRule.style, rules);
		}
	}

	private collectVariables(style: CSSStyleDeclaration, vars: Map<string, string>) {
		for (let i = 0; i < style.length; i++) {
			const prop = style.item(i);
			if (!prop || !prop.startsWith("--")) {
				continue;
			}
			const value = style.getPropertyValue(prop).trim();
			if (value) {
				vars.set(prop, value);
			}
		}
	}

	private collectDeclarations(selector: string, style: CSSStyleDeclaration, rules: Rules) {
		let ruleMap = rules.get(selector);
		if (!ruleMap) {
			ruleMap = new Map();
			rules.set(selector, ruleMap);
		}
		for (let i = 0; i < style.length; i++) {
			const prop = style.item(i);
			if (!prop || prop.startsWith("--")) {
				continue;
			}
			const value = style.getPropertyValue(prop).trim();
			if (!value) {
				continue;
			}
			ruleMap.set(prop, {
				value,
				important: style.getPropertyPriority(prop) === "important",
			});
		}
	}

	private parseWithFallback(cssText: string, vars: Map<string, string>, rules: Rules) {
		const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
		const ruleRegex = /([^{@}]+)\{([^}]*)\}/g;
		let match: RegExpExecArray | null;
		while ((match = ruleRegex.exec(cleaned)) !== null) {
			const selectorText = match[1].trim();
			if (!selectorText || selectorText.startsWith("@")) {
				continue;
			}
			const body = match[2];
			const declarations = this.parseDeclarations(body);
			const selectors = selectorText
				.split(",")
				.map((selector) => selector.trim())
				.filter(Boolean);
			for (const selector of selectors) {
				if (selector === ":root") {
					for (const [key, value] of declarations.entries()) {
						if (key.startsWith("--")) {
							vars.set(key, value.value);
						}
					}
					continue;
				}
				let ruleMap = rules.get(selector);
				if (!ruleMap) {
					ruleMap = new Map();
					rules.set(selector, ruleMap);
				}
				for (const [key, decl] of declarations.entries()) {
					if (key.startsWith("--")) {
						continue;
					}
					ruleMap.set(key, decl);
				}
			}
		}
	}

	private parseDeclarations(body: string): Map<string, RuleDecl> {
		const result = new Map<string, RuleDecl>();
		const parts = body.split(";");
		for (const part of parts) {
			const cleaned = part.trim();
			if (!cleaned) {
				continue;
			}
			const colonIndex = cleaned.indexOf(":");
			if (colonIndex === -1) {
				continue;
			}
			const prop = cleaned.slice(0, colonIndex).trim();
			if (!prop) {
				continue;
			}
			let value = cleaned.slice(colonIndex + 1).trim();
			let important = false;
			if (value.endsWith("!important")) {
				important = true;
				value = value.replace(/!important$/i, "").trim();
			}
			if (value) {
				result.set(prop, { value, important });
			}
		}
		return result;
	}

	private normalizeSelector(selector: string) {
		const pseudoMatch = selector.match(/::(before|after)/);
		const pseudo = pseudoMatch ? pseudoMatch[1] as 'before' | 'after' : null;
		const baseSelector = pseudo ? selector.replace(/::(before|after)/g, '') : selector;
		return { baseSelector, pseudo };
	}

	private ensurePseudoElement(target: HTMLElement, pseudo: 'before' | 'after', content: string | undefined) {
		const attr = `data-one2mp-pseudo-${pseudo}`;
		let pseudoEl = target.querySelector<HTMLElement>(`[${attr}]`);
		if (!pseudoEl) {
			pseudoEl = document.createElement('span');
			pseudoEl.setAttribute(attr, 'true');
			if (pseudo === 'before') {
				target.prepend(pseudoEl);
			} else {
				target.append(pseudoEl);
			}
		}
		if (content) {
			pseudoEl.textContent = content.replace(/(^")|("$)/g, '');
		}
		return pseudoEl;
	}

	applyStyleToElement(currentNode: HTMLElement) {
		this.rules.forEach((rule, selector) => {
			const { baseSelector, pseudo } = this.normalizeSelector(selector);
			try {
				if (currentNode.matches(baseSelector)) {
					let target = currentNode;
					if (pseudo) {
						const contentDecl = rule.get('content');
						target = this.ensurePseudoElement(currentNode, pseudo, contentDecl?.value);
					}
					rule.forEach((decl, prop) => {
						if (prop === 'content') {
							return;
						}
						let value = this.resolveCssVars(decl.value, this.vars);
						target.setCssProps({
							[prop]: decl.important ? `${value} !important` : value,
						});
					})
				}
			} catch (error) {
				console.debug('error selector=>', selector, ' | Error=>', (error as Error).message);
			}
		})
		let element = currentNode.firstElementChild;
		while (element) {
			this.applyStyleToElement(element as HTMLElement);
			element = element.nextElementSibling;
		}
		return currentNode;
	}
	removeClassName(root: HTMLElement) {
		const className = root.getAttribute('class');
		if (className) {
			const classes = className.split(' ');
			for (const c of classes) {
				if (isClassReserved(c)) {
					continue;
				}
				root.classList.remove(c);
			}
		}
		root.removeAttribute('class');
		let element = root.firstElementChild;
		while (element) {
			this.removeClassName(element as HTMLElement);
			element = element.nextElementSibling;
		}
	}
}
