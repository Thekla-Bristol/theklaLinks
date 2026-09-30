// Builds preview/index.html: one self-contained file (CSS, JS and sample data inlined).
//   node scripts/build-preview.mjs [events.json]   → uses test/sample-events.json by default
import fs from 'node:fs';
import { scoreEvents } from './lib/featured.mjs';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const parsed = JSON.parse(read(process.argv[2] ? `../${process.argv[2]}` : 'test/sample-events.json'));
scoreEvents(parsed.events);
const data = JSON.stringify(parsed);
let html = read('site/index.html')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('site/styles.css')}\n</style>`)
  .replace('<script src="app.js" defer></script>',
    `<script>window.__EVENTS__ = ${data};window.__PREVIEW__ = true;</script>\n<script>\n${read('site/app.js')}\n</script>`)
  .replace('<script src="motion.js" defer></script>', `<script>\n${read('site/motion.js')}\n</script>`)
  .replace('<script src="sheets.js" defer></script>', `<script>\n${read('site/sheets.js')}\n</script>`)
  .replace('<script src="seasons.js" defer></script>', `<script>\n${read('site/seasons.js')}\n</script>`)
  .replace('<script src="track.js" defer></script>', `<script>\n${read('site/track.js')}\n</script>`)
  .replace(/^.*__COUNTER_URL__.*\n/m, '');
fs.mkdirSync(new URL('../preview/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../preview/index.html', import.meta.url), html);
console.log('wrote preview/index.html');
