// Eenmalig hulpscript: ontdubbelt bestaande leads via de Supabase Management-API.
// Archiveert (niet verwijderen) onaangeraakte dubbele kopieën; per "auto van dezelfde
// berijder" blijft één lead actief — bij voorkeur de al bewerkte, anders de oudste.
// Draai: node scripts/dedup-leads.mjs           → preview (toont wat er zou gebeuren)
//        node scripts/dedup-leads.mjs --apply   → archiveert de dubbelen
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const get = (k) =>
  (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const TOKEN = get('SUPABASE_ACCESS_TOKEN');
const REF = 'rvyiacwachanliukpaqh';
const apply = process.argv.includes('--apply');

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(out));
  return out;
}

const normEmail = (e) => (e ? String(e).trim().toLowerCase() : '');
const normAuto = (a) => (a ? String(a).trim().toLowerCase().replace(/\s+/g, ' ') : '');
const normTel = (t) => {
  const d = String(t ?? '').replace(/\D/g, '');
  return d.length >= 6 ? d.slice(-9) : '';
};
const naamKey = (n) => {
  const x = String(n ?? '').trim().toLowerCase();
  return x && x !== 'onbekend' && x.length >= 4 ? x : '';
};
const ident = (l) => normEmail(l.email) || normTel(l.telefoon) || naamKey(l.klant_naam);
const zelfdeAuto = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const [k, lng] = a.length <= b.length ? [a, b] : [b, a];
  return k.length >= 5 && lng.startsWith(k);
};
const onaangeraakt = (l) =>
  l.status === 'nieuw' && !l.wie && (!l.notities || l.notities === '');

const rows = await q(
  `select id, klant_naam, email, telefoon, auto, advertentie_url, status, wie, notities, created_at
   from leads where not gearchiveerd order by created_at asc;`,
);

// Groepeer per contactidentiteit, dan clusteren op "zelfde auto" (prefix) of zelfde URL.
const perIdent = new Map();
for (const l of rows) {
  const id = ident(l);
  if (!id) continue;
  if (!perIdent.has(id)) perIdent.set(id, []);
  perIdent.get(id).push(l);
}

const teArchiveren = [];
for (const groep of perIdent.values()) {
  const clusters = [];
  for (const l of groep) {
    const c = clusters.find((cl) =>
      cl.some(
        (x) =>
          (l.advertentie_url && x.advertentie_url && l.advertentie_url === x.advertentie_url) ||
          zelfdeAuto(normAuto(l.auto), normAuto(x.auto)),
      ),
    );
    if (c) c.push(l);
    else clusters.push([l]);
  }
  for (const cl of clusters) {
    if (cl.length < 2) continue;
    // Behoud: een bewerkte lead als die er is, anders de oudste (cl is al op datum gesorteerd).
    const bewerkt = cl.find((l) => !onaangeraakt(l));
    const behoud = bewerkt ?? cl[0];
    for (const l of cl) {
      if (l.id !== behoud.id && onaangeraakt(l)) teArchiveren.push({ ...l, behoud: behoud.id });
    }
  }
}

if (teArchiveren.length === 0) {
  console.log('Geen dubbele leads gevonden om te archiveren.');
} else {
  console.log(`${teArchiveren.length} dubbele lead(s)${apply ? '' : ' (preview)'}:`);
  for (const l of teArchiveren)
    console.log(`  - ${l.klant_naam} | ${l.auto} | ${ident(l)} → archiveren (behoud ${l.behoud})`);
  if (apply) {
    const ids = teArchiveren.map((l) => `'${l.id}'`).join(',');
    const upd = await q(`update leads set gearchiveerd = true where id in (${ids}) returning id;`);
    console.log(`Gearchiveerd: ${Array.isArray(upd) ? upd.length : JSON.stringify(upd)}.`);
  } else {
    console.log('Niets gewijzigd. Draai met --apply om te archiveren.');
  }
}
