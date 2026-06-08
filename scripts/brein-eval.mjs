// BREIN eval — batch-test van de beslislogica.
// Draait alle scenario's in één keer door de conceptgenerator en print een
// overzicht. Zo hoef je niet elk geval los in de UI te testen.
//
// Gebruik (dev-server moet draaien op :3000):
//   node scripts/brein-eval.mjs

const BASE = process.env.BREIN_BASE ?? 'http://localhost:3000';
const SECRET = process.env.BREIN_SYNC_SECRET ?? 'brein-sync-dev-2026';

// Pas scenario's vrij aan / vul aan met echte voorbeelden.
// 'afzenderEmail' met een bekend HubSpot-contact → woonplaats wordt meegenomen.
// 'kenteken' met een bekende deal → leasemaatschappij/APK enz. worden meegenomen.
const SCENARIOS = [
  { naam: 'Tankpas geblokkeerd (3x pincode)', verwacht: '24u wachten, automatisch gedeblokkeerd; GEEN nieuwe pas',
    onderwerp: 'Tankpas werkt niet', body: 'Ik heb 3x verkeerd gepind en nu doet mijn tankpas het niet meer. Kunnen jullie een nieuwe sturen?' },
  { naam: 'Tankpas verloren', verwacht: 'nieuwe pas aanvragen, naar huisadres',
    onderwerp: 'Tankpas kwijt', body: 'Ik ben mijn tankpas verloren, wat nu?' },
  { naam: 'Pincode vergeten', verwacht: 'pincode mailen (placeholder) of verwijzen naar leasemij',
    onderwerp: 'Pincode tankpas', body: 'Ik ben de pincode van mijn tankpas vergeten, kun je die doorgeven?' },
  { naam: 'Onderhoud lease', verwacht: 'merkdealer o.b.v. woonplaats', afzenderEmail: 'joep@pepewagenparkbeheer.nl',
    onderwerp: 'Onderhoud', body: 'Mijn auto moet een onderhoudsbeurt. Waar kan ik terecht?' },
  { naam: 'Schade melden', verwacht: 'schadeformulier + leasemaatschappij schade-URL', afzenderEmail: 'joep@pepewagenparkbeheer.nl', kenteken: 'XX-123-X',
    onderwerp: 'Schade', body: 'Ik heb een deuk in mijn bumper gereden, hoe meld ik de schade?' },
  { naam: 'Ruitschade', verwacht: 'leasemaatschappij ruitschade-instructie/voorkeursleverancier', kenteken: 'XX-123-X',
    onderwerp: 'Ster in voorruit', body: 'Er zit een ster in mijn voorruit, wat moet ik doen?' },
  { naam: 'Bijtelling / fiscale waarde', verwacht: 'RDW fiscale waarde + bijtelling (DATA NODIG)', kenteken: 'XX-123-X',
    onderwerp: 'Bijtelling', body: 'Hoeveel bijtelling betaal ik voor mijn auto?' },
  { naam: 'APK', verwacht: 'RDW APK-datum + advies (DATA NODIG)', kenteken: 'XX-123-X',
    onderwerp: 'APK', body: 'Wanneer moet mijn auto voor APK?' },
  { naam: 'Adreswijziging', verwacht: 'HubSpot bijwerken + doorsturen leasemaatschappij',
    onderwerp: 'Verhuisd', body: 'Ik ben verhuisd naar een nieuw adres, kunnen jullie dit aanpassen?' },
  { naam: 'Onbekend / random', verwacht: '[ACTIE MEDEWERKER]',
    onderwerp: 'Vraagje', body: 'Kan ik mijn leaseauto meenemen op vakantie naar Italië en geldt mijn verzekering daar?' },
];

function trunc(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

for (const sc of SCENARIOS) {
  const res = await fetch(`${BASE}/api/brein/eval?secret=${SECRET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sc),
  });
  const data = await res.json().catch(() => ({}));
  console.log('\n══════════════════════════════════════════════════');
  console.log('▶ ' + sc.naam);
  console.log('  verwacht : ' + sc.verwacht);
  if (data.context?.length) console.log('  context  : ' + data.context.join(' | '));
  console.log('  ── concept ──');
  console.log((data.concept ?? ('FOUT: ' + (data.error ?? res.status))).split('\n').map((l) => '  ' + l).join('\n'));
}
console.log('\n══════════════════════════════════════════════════\nKlaar.');
