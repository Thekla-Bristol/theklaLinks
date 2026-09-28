// Builds preview/index.html: one self-contained file (CSS, JS and sample data inlined).
//   node scripts/build-preview.mjs [events.json]   → uses test/sample-events.json by default
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const data = read(process.argv[2] ? `../${process.argv[2]}` : 'test/sample-events.json');
let html = read('site/index.html')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('site/styles.css')}\n</style>`)
  .replace('<script src="app.js" defer></script>',
    `<script>window.__EVENTS__ = ${data.trim()};</script>\n<script>\n${read('site/app.js')}\n</script>`);
fs.mkdirSync(new URL('../preview/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../preview/index.html', import.meta.url), html);
console.log('wrote preview/index.html');
