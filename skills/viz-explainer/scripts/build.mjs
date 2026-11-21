// Build a viz-explainer artifact from a spec JSON and validate every step id against Pele's output.
// usage: bun skills/viz-explainer/scripts/build.mjs spec.json out.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './load.mjs';

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) { console.error('usage: build.mjs spec.json out.html'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const { render } = await load('pele', '1.12.0', here);
const tpl = readFileSync(join(here, '..', 'assets', 'template.html'), 'utf8');
const specText = readFileSync(specPath, 'utf8');
const spec = JSON.parse(specText);

const diagrams = spec.options ? spec.options.map(o => [o.id, o.diagram]) : [['d', spec.diagram]];
let bad = 0;
for (const [id, src] of diagrams) {
  let r;
  try { r = render(src); } catch (e) { console.error(`✗ ${id}: ${e.code} at ${e.line}:${e.column}\n${e.snippet ?? ''}`); bad++; continue; }
  const ids = new Set([...r.svg.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]));
  const steps = (spec.steps || []).filter(s => !s.option || s.option === id);
  const missing = steps.flatMap(s => [...(s.focus || []), ...(s.edges || [])]).filter(x => !ids.has(x));
  if (missing.length) { console.error(`✗ ${id}: steps reference ids not in the diagram: ${[...new Set(missing)].join(', ')}\n  available: ${[...ids].join(', ')}`); bad++; }
  else console.log(`✓ ${id}: ${r.type} ${r.width}x${r.height}, ${steps.length} steps`);
}
if (bad) process.exit(1);
if ((spec.steps || []).length > 8) console.warn('! more than 8 steps; the skill says split the artifact');
for (const s of spec.steps || []) if ((s.caption || '').split(/\s+/).length > 20) console.warn(`! caption over 20 words: "${s.caption}"`);

const out = tpl
  .replace(/(<script type="application\/json" id="spec">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}\n${specText.trim()}\n${b}`)
  .replace(/<title>[^<]*<\/title>/, `<title>${String(spec.question).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</title>`);
writeFileSync(outPath, out);
console.log(`→ ${outPath}`);
