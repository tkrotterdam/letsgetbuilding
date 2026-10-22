// Copies exactly the files the site needs into dist/, ready for Cloudflare (or any static host).
// Run: node tools/build_site.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const copy = rel => { const to = path.join(out, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(root, rel), to); return fs.statSync(to).size; };
let total = 0, n = 0;
for (const f of ['index.html', 'data/scene.json', 'data/satellite.jpg', ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)]) {
  const s = copy(f); total += s; n++;
  if (s > 25 * 1024 * 1024) throw new Error(`${f} is over Cloudflare's 25 MiB per-file limit`);
}
console.log(`dist/: ${n} files, ${(total / 1048576).toFixed(1)} MiB`);
