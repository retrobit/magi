import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PALETTES } from './types';

// Palette CSS coverage invariant.
//
// Every non-default palette (everything except 'rgb', which is the :root
// default and needs no class) must have TWO blocks in layout.css:
//
//   .palette-<name>        { --magi-node-red: …; --magi-node-green: …;
//                            --magi-node-blue: …; --magi-hex-hot: …; }
//   .light.palette-<name>  { … same four vars … }
//
// These blocks are the only source of truth for a palette's colour values.
// If a new palette is added to PALETTES without a matching CSS block, or if a
// CSS block loses one of the four required custom properties, this test fails
// loudly before the gap reaches production.
const layoutCss = readFileSync(
	resolve(new URL('.', import.meta.url).pathname, '../../routes/layout.css'),
	'utf8'
);

const REQUIRED_VARS = [
	'--magi-node-red',
	'--magi-node-green',
	'--magi-node-blue',
	'--magi-hex-hot'
];

/** Return the first CSS rule block (opening brace to matching closing brace)
 *  whose selector matches `selectorRe`, or null if none is found. Robust to
 *  extra whitespace and surrounding rules added by other implementers. */
function findBlock(selectorRe: RegExp): string | null {
	const idx = layoutCss.search(selectorRe);
	if (idx === -1) return null;
	const open = layoutCss.indexOf('{', idx);
	if (open === -1) return null;
	let depth = 0;
	let close = open;
	for (let i = open; i < layoutCss.length; i++) {
		if (layoutCss[i] === '{') depth++;
		else if (layoutCss[i] === '}') {
			depth--;
			if (depth === 0) {
				close = i;
				break;
			}
		}
	}
	return layoutCss.slice(open, close + 1);
}

// 'rgb' is the :root default — it intentionally has no palette-rgb class.
const nonDefaultPalettes = PALETTES.filter((p) => p !== 'rgb');

describe('palette CSS coverage', () => {
	for (const palette of nonDefaultPalettes) {
		describe(`palette: ${palette}`, () => {
			it(`has a .palette-${palette} block in layout.css`, () => {
				// Match the selector line; allow it to appear after newlines/spaces.
				const re = new RegExp(`\\.palette-${palette}\\s*\\{`);
				const block = findBlock(re);
				expect(block, `.palette-${palette} block not found in layout.css`).not.toBeNull();
			});

			it(`has a .light.palette-${palette} block in layout.css`, () => {
				const re = new RegExp(`\\.light\\.palette-${palette}\\s*\\{`);
				const block = findBlock(re);
				expect(block, `.light.palette-${palette} block not found in layout.css`).not.toBeNull();
			});

			for (const varName of REQUIRED_VARS) {
				it(`.palette-${palette} defines ${varName}`, () => {
					const re = new RegExp(`\\.palette-${palette}\\s*\\{`);
					// Exclude the .light companion (it has the same name with a prefix).
					const lightRe = new RegExp(`\\.light\\.palette-${palette}`);
					const idx = layoutCss.search(re);
					// Find the dark-only block: search forward from idx, skipping the
					// .light variant (which has higher specificity and appears after).
					// Strategy: find the first match that is NOT preceded by '.light'.
					let searchFrom = 0;
					let blockContent: string | null = null;
					while (searchFrom < layoutCss.length) {
						const match = layoutCss.slice(searchFrom).search(re);
						if (match === -1) break;
						const absPos = searchFrom + match;
						// Check whether '.light' immediately precedes '.palette-<name>'
						// (possibly with whitespace — but the CSS has no whitespace between
						// .light and .palette-<name>, so a simple lookbehind window suffices).
						const prefix = layoutCss.slice(Math.max(0, absPos - 10), absPos);
						if (!lightRe.test(prefix + layoutCss.slice(absPos, absPos + 40))) {
							const open = layoutCss.indexOf('{', absPos);
							if (open !== -1) {
								let depth = 0;
								let close = open;
								for (let i = open; i < layoutCss.length; i++) {
									if (layoutCss[i] === '{') depth++;
									else if (layoutCss[i] === '}') {
										depth--;
										if (depth === 0) {
											close = i;
											break;
										}
									}
								}
								blockContent = layoutCss.slice(open, close + 1);
							}
							break;
						}
						searchFrom = absPos + 1;
					}
					void idx; // used only for context above
					expect(blockContent, `.palette-${palette} dark block not found`).not.toBeNull();
					expect(blockContent, `.palette-${palette} missing ${varName}`).toMatch(
						new RegExp(varName.replace('--', '--'))
					);
				});

				it(`.light.palette-${palette} defines ${varName}`, () => {
					const re = new RegExp(`\\.light\\.palette-${palette}\\s*\\{`);
					const block = findBlock(re);
					expect(block, `.light.palette-${palette} block not found`).not.toBeNull();
					expect(block, `.light.palette-${palette} missing ${varName}`).toMatch(
						new RegExp(varName)
					);
				});
			}
		});
	}
});
