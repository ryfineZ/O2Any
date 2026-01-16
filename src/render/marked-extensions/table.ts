/**
 * marked extension for table
 * add container for table
 * 
 * 
 */

import { Tokens, MarkedExtension } from "marked";
import { One2MpMarkedExtension } from "./extension";


export class Table extends One2MpMarkedExtension {

    markedExtension(): MarkedExtension {
        return {
            extensions: [
                {
                    name: 'table',
                    level: 'block', // Is this a block-level or inline-level tokenizer?
                    renderer: (token: Tokens.Table) => {
                        const renderCell = (
                            cell: Tokens.TableCell,
                            tag: "th" | "td"
                        ) => {
                            const alignValue = cell.align;
                            const style = alignValue
                                ? ` style="text-align:${alignValue};"`
                                : "";
                            const content = cell.tokens?.length
                                ? this.marked.Parser.parseInline(cell.tokens)
                                : cell.text;
                            return `<${tag}${style}>${content}</${tag}>`;
                        };

                        const headerCells = token.header.map((cell) =>
                            renderCell(cell, "th")
                        );
                        const bodyRows = token.rows.map((row) => {
                            const cells = row.map((cell) =>
                                renderCell(cell, "td")
                            );
                            return `<tr>${cells.join("")}</tr>`;
                        });

                        return `<section class="table-container"><table><thead><tr>${headerCells.join(
                            ""
                        )}</tr></thead><tbody>${bodyRows.join(
                            ""
                        )}</tbody></table></section>`;
                    }
                }
            ]
        }
    }
}
