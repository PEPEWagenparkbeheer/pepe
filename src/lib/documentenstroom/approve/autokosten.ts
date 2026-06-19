// Handler voor autokosten-approve.
// Koppelt werkplaatsfactuur aan bestaande deal (op kenteken) en slaat regels op.
// Geen deal gevonden → status 'gefaald' (geen wees-deals aanmaken).
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchDealByKenteken, uploadFile, createNoteOnDeal } from '@/lib/hubspot';
import type { AutokostenRegel } from '@/lib/documentenstroom/autokosten';

export async function approveAutokosten(
  factuur: Record<string, unknown>,
  admin: SupabaseClient,
): Promise<{ companyId: string | null; contactId: string | null; dealId: string }> {
  const kenteken = String(factuur.kenteken ?? '').trim();
  if (!kenteken) throw new Error('Kenteken ontbreekt bij autokosten');

  const dealId = await searchDealByKenteken(kenteken);
  if (!dealId) {
    throw new Error(`Auto ${kenteken} niet gevonden in HubSpot — factuur kan niet worden gekoppeld`);
  }

  // Lees regels uit extracted_data (gevuld door extraheertAutokosten in inbound)
  const ext = factuur.extracted_data as {
    regels?: AutokostenRegel[];
    garage_naam?: string | null;
    factuurnummer?: string | null;
    bedrag_excl_btw?: number | null;
    bedrag_incl_btw?: number | null;
  } | null;
  const regels: AutokostenRegel[] = ext?.regels ?? [];

  // ── PDF-kopie + kostenoverzicht als notitie op deal ────
  if (factuur.pdf_storage_path) {
    try {
      const { data: blob, error: dlErr } = await admin.storage
        .from('facturen').download(String(factuur.pdf_storage_path));
      if (!dlErr && blob) {
        const naam = `Autokosten ${kenteken} ${factuur.factuurdatum ?? ''}.pdf`;
        const fileId = await uploadFile(await blob.arrayBuffer(), naam);

        const regelHtml = regels.length
          ? '<br><b>Werkzaamheden:</b><br>' + regels
              .map((r) => `${r.omschrijving}: € ${r.bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`)
              .join('<br>')
          : '';
        const totaalExcl = ext?.bedrag_excl_btw != null
          ? `€ ${Number(ext.bedrag_excl_btw).toLocaleString('nl-NL', { minimumFractionDigits: 2 })} excl. btw`
          : '';
        const noteHtml = [
          `<strong>Autokosten ${kenteken}</strong>`,
          ext?.garage_naam ? `Garage: ${ext.garage_naam}` : '',
          factuur.factuurdatum ? `Datum: ${factuur.factuurdatum}` : '',
          totaalExcl,
          regelHtml,
          `Verwerkt in Flow op ${new Date().toLocaleDateString('nl-NL')}.`,
        ].filter(Boolean).map((r) => `<p>${r}</p>`).join('');
        await createNoteOnDeal(dealId, noteHtml, fileId);
      }
    } catch (e) {
      console.error('autokosten-bijlage naar HubSpot mislukt:', (e as Error).message);
    }
  }

  // ── Regels opslaan in autokosten_regels ────────────────
  if (regels.length) {
    const rows = regels.map((r) => ({
      factuur_id: factuur.id as string,
      kenteken,
      hubspot_deal_id: dealId,
      factuurdatum: factuur.factuurdatum ? String(factuur.factuurdatum) : null,
      omschrijving: r.omschrijving,
      categorie: r.categorie,
      bedrag: r.bedrag,
      aantal: r.aantal ?? 1,
    }));
    const { error: insertErr } = await admin.from('autokosten_regels').insert(rows);
    if (insertErr) {
      console.error('autokosten_regels insert fout:', insertErr.message);
    }
  }

  return { companyId: null, contactId: null, dealId };
}
