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

// (?<!\.light) skips the .light.palette-<name> variant, which shares the suffix.
const blocks = [
	{
		label: '.palette-',
		selector: (p: string) => new RegExp(`(?<!\\.light)\\.palette-${p}\\s*\\{`)
	},
	{
		label: '.light.palette-',
		selector: (p: string) => new RegExp(`\\.light\\.palette-${p}\\s*\\{`)
	}
];

describe('palette CSS coverage', () => {
	for (const palette of nonDefaultPalettes) {
		for (const { label, selector } of blocks) {
			const block = findBlock(selector(palette));
			it(`${label}${palette} block exists in layout.css`, () => {
				expect(block, `${label}${palette} block not found`).not.toBeNull();
			});
			it.each(REQUIRED_VARS)(`${label}${palette} defines %s`, (varName) => {
				expect(block, `${label}${palette} missing ${varName}`).toContain(`${varName}:`);
			});
		}
	}
});
