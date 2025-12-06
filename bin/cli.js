#!/usr/bin/env node

// biome-ignore lint/security/noGlobalEval: dual esm and cjs
if (typeof require === 'undefined') eval("import('../dist/esm/cli.js').then((cli) => cli.default(process.argv.slice(2))).catch((err) => { console.log(err.message); process.exit(1); });");
else require('../dist/cjs/cli.js').default(process.argv.slice(2));
