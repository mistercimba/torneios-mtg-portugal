#!/usr/bin/env node
// Última verificação antes de publicar: corre sobre a pasta que vai para o GitHub Pages.
// Falha (e cancela a publicação) se encontrar o endereço secreto, um endereço iCal privado,
// ou campos no events.json que não estejam na lista pública.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { redact, PUBLIC_FIELDS } from './build-data.mjs';

const dir = resolve(process.argv[2] || 'site');
const TOP_LEVEL = ['generatedAt', 'timeZone', 'count', 'milestones', 'events'];
const problems = [];

async function* walk(d) {
  for (const entry of await readdir(d, { withFileTypes: true })) {
    const p = join(d, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

for await (const file of walk(dir)) {
  const text = await readFile(file, 'utf8');
  if (redact(text) !== text) problems.push(`${file}: contém um endereço iCal privado ou o segredo`);
  if (file.endsWith('events.json')) {
    const data = JSON.parse(text);
    for (const k of Object.keys(data)) if (!TOP_LEVEL.includes(k)) problems.push(`${file}: campo de topo não previsto «${k}»`);
    const extra = new Set();
    for (const e of data.events || []) for (const k of Object.keys(e)) if (!PUBLIC_FIELDS.includes(k)) extra.add(k);
    for (const k of extra) problems.push(`${file}: campo não público nos eventos «${k}»`);
  }
}

if (problems.length) {
  console.error(`ERRO: verificação de dados públicos falhou:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: ${dir} não contém o endereço iCal nem campos privados.`);
