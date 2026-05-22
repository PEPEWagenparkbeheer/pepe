export interface RdwVoertuig {
  apkDatum: string | null;
  recalls: RdwRecall[];
  voertuig: Record<string, string>;
  brandstof: string | null;       // bv "Benzine", "Diesel", "Elektriciteit"
  catalogusprijs: number | null;  // bruto cataloguswaarde — geschikt als fiscale waarde
}

export interface RdwRecall {
  typegoedkeuringsnummer: string;
  code_terugroepactie: string;
  omschrijving_defect: string;
  beschrijving_terugroepactie: string;
}

export async function rdwOpzoeken(kenteken: string): Promise<RdwVoertuig | null> {
  const kt = kenteken.replace(/-/g, '').toUpperCase();
  try {
    const [voertuigRes, terugroepRes, brandstofRes] = await Promise.all([
      fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${kt}`),
      fetch(`https://opendata.rdw.nl/resource/t49b-isb7.json?`),
      fetch(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${kt}`),
    ]);

    const voertuigen = await voertuigRes.json();
    const terugroepAll: RdwRecall[] = await terugroepRes.json();
    const brandstoffen: { brandstof_omschrijving?: string }[] = await brandstofRes.json();

    if (!voertuigen.length) return null;
    const v = voertuigen[0];

    let apkDatum: string | null = null;
    if (v.vervaldatum_apk && v.vervaldatum_apk.length >= 8) {
      const d = v.vervaldatum_apk;
      apkDatum = `${d.substring(6, 8)}-${d.substring(4, 6)}-${d.substring(0, 4)}`;
    }

    const tg = v.typegoedkeuringsnummer || '';
    const recalls = terugroepAll.filter((r) => tg && r.typegoedkeuringsnummer === tg);

    // Brandstof kan meerdere rijen bevatten bij hybrides — neem de eerste.
    const brandstof = brandstoffen[0]?.brandstof_omschrijving ?? null;

    const catalogusprijs = v.catalogusprijs ? Number(v.catalogusprijs) : null;

    return { apkDatum, recalls, voertuig: v, brandstof, catalogusprijs };
  } catch (e) {
    console.error('RDW fout:', e);
    return null;
  }
}

export function apkKleurStatus(apkDatum: string): 'verlopen' | 'rood' | 'oranje' | 'groen' | null {
  if (!apkDatum) return null;
  const parts = apkDatum.split('-');
  if (parts.length !== 3) return null;
  const verval = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const nu = new Date();
  const maanden = (verval.getFullYear() - nu.getFullYear()) * 12 + (verval.getMonth() - nu.getMonth());
  if (maanden < 0) return 'verlopen';
  if (maanden < 6) return 'rood';
  if (maanden < 9) return 'oranje';
  return 'groen';
}
