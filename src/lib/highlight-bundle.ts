// Curated highlight.js: core plus the grammars that actually turn up in model
// output. Reached ONLY via a dynamic import (see highlight-loader.svelte.ts), so
// none of this lands in the critical page chunk. highlight.js/lib/common bundled
// 37 grammars (~163 KB, a third of the page chunk); this set is a fraction of
// that and loads after first paint. Unknown languages fall back to plain escaped
// code in Markdown.svelte, so the list only needs the common cases.
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';

// Each grammar also registers its own aliases (js, ts, py, sh, yml, html, …).
const LANGUAGES = {
	javascript,
	typescript,
	python,
	json,
	bash,
	shell,
	xml,
	css,
	sql,
	yaml,
	markdown,
	rust,
	go,
	java,
	c,
	cpp
};
for (const [name, lang] of Object.entries(LANGUAGES)) {
	hljs.registerLanguage(name, lang);
}

export default hljs;
