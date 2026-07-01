'use client';

// Koppelt een after-sales import-auto aan een geparkeerde (pijplijn-)factuur uit DocuSign.
// Handmatige koppeling met klantnaam-suggestie — mens bevestigt altijd (geen auto-koppeling).
// Gebruikt vanuit ZoekenPage (bij doorzetten) én AfterSalesPage (knop op een auto-rij).

import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import type { UitgaandeFactuur } from '@/types/factuur';

interface Props {
  afterSalesId: string;
  klantNaam?: string | null;
  onSluiten: () => void;
  onGekoppeld?: (factuur: UitgaandeFactuur) => void;
}

const euro = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

function naamMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase(), nb = b.trim().toLowerCase();
  return !!na && !!nb && (na.includes(nb) || nb.includes(na));
}

export default function KoppelFactuurModal({ afterSalesId, klantNaam, onSluiten, onGekoppeld }: Props) {
  const [facturen, setFacturen] = useState<UitgaandeFactuur[]>([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/uitgaande-facturen?status=pijplijn&ongekoppeld=1', {
          headers: await authHeaders(),
        });
        const j = await res.json();
        setFacturen(Array.isArray(j) ? j : (j.facturen ?? []));
      } catch (e) { setFout(String(e)); }
      finally { setLaden(false); }
    })();
  }, []);

  // Suggestie: facturen met een klantnaam-match bovenaan.
  const gesorteerd = useMemo(() => {
    const k = klantNaam ?? '';
    return [...facturen].sort((a, b) => {
      const ma = naamMatch(a.klant_naam ?? '', k) ? 0 : 1;
      const mb = naamMatch(b.klant_naam ?? '', k) ? 0 : 1;
      return ma - mb;
    });
  }, [facturen, klantNaam]);

  async function koppel(f: UitgaandeFactuur) {
    if (!f.id) return;
    setBezig(f.id); setFout(null);
    try {
      const res = await fetch(`/api/uitgaande-facturen/${f.id}`, {
        method: 'PATCH',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ after_sales_id: afterSalesId }),
      });
      const j = await res.json();
      if (!res.ok) { setFout(j.error ?? 'Koppelen mislukt'); return; }
      onGekoppeld?.(j.factuur ?? f);
      onSluiten();
    } catch (e) { setFout(String(e)); }
    finally { setBezig(null); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface, #fff)', borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #eee)' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Koppel DocuSign-factuur aan deze auto</h3>
          {klantNaam && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted, #6b7280)' }}>Klant: {klantNaam}</p>}
        </div>

        <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
          {laden && <p style={{ color: 'var(--muted, #6b7280)', fontSize: 14 }}>Laden…</p>}
          {!laden && gesorteerd.length === 0 && (
            <p style={{ color: 'var(--muted, #6b7280)', fontSize: 14 }}>
              Geen open pijplijn-facturen gevonden. De DocuSign-order is er mogelijk nog niet — koppelen kan later ook vanuit de auto-rij.
            </p>
          )}
          {gesorteerd.map((f) => {
            const match = naamMatch(f.klant_naam ?? '', klantNaam ?? '');
            const auto = [f.voertuig?.merk, f.voertuig?.model].filter(Boolean).join(' ') || 'Auto';
            return (
              <div key={f.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 12px', border: `1px solid ${match ? 'var(--accent, #2563eb)' : 'var(--border, #eee)'}`,
                borderRadius: 10, marginBottom: 8, background: match ? 'rgba(37,99,235,0.06)' : 'transparent',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {f.klant_naam ?? '—'} {match && <span style={{ fontSize: 11, color: 'var(--accent, #2563eb)' }}>● match</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>
                    {auto} · {euro(f.voertuig?.toe_te_betalen)}
                  </div>
                </div>
                <button className="btn btn-a" disabled={bezig === f.id} onClick={() => koppel(f)}>
                  {bezig === f.id ? '…' : 'Koppel'}
                </button>
              </div>
            );
          })}
          {fout && <p style={{ color: 'var(--danger, #dc2626)', fontSize: 13 }}>{fout}</p>}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border, #eee)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onSluiten}>Komt later / sluiten</button>
        </div>
      </div>
    </div>
  );
}
