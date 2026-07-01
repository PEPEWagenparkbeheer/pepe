'use client';

// Read-only orderboek/forecast van geparkeerde import-facturen: per after-sales-fase en verwachte
// omzet per maand (o.b.v. de TransConnect-leverdatum). Data uit GET /api/facturatie/pijplijn.

import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import type { PijplijnFase } from '@/app/api/facturatie/pijplijn/route';

interface PijplijnItem {
  id: string;
  klant: string | null;
  merk: string | null;
  model: string | null;
  bedrag: number | null;
  gekoppeld: boolean;
  transportdatum: string | null;
  transport_status: string | null;
  fase: PijplijnFase;
}

const euro = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const FASE_VOLGORDE: PijplijnFase[] = ['nieuw', 'aangevraagd', 'onderweg', 'binnen', 'rijklaar', 'ongekoppeld'];
const FASE_LABEL: Record<PijplijnFase, string> = {
  nieuw: 'Nieuw', aangevraagd: 'Aangevraagd', onderweg: 'Onderweg',
  binnen: 'Binnen', rijklaar: 'Rijklaar', ongekoppeld: 'Niet gekoppeld',
};

function maandLabel(iso: string): string {
  const [j, m] = iso.split('-');
  const nm = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${nm[Number(m) - 1] ?? m} ${j}`;
}

export default function PijplijnOverzicht() {
  const [items, setItems] = useState<PijplijnItem[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/facturatie/pijplijn', { headers: await authHeaders() });
        const j = await res.json();
        setItems(j.items ?? []);
      } finally { setLaden(false); }
    })();
  }, []);

  const perFase = useMemo(() => {
    const m = new Map<PijplijnFase, { aantal: number; som: number }>();
    for (const it of items) {
      const g = m.get(it.fase) ?? { aantal: 0, som: 0 };
      g.aantal++; g.som += it.bedrag ?? 0;
      m.set(it.fase, g);
    }
    return m;
  }, [items]);

  const perMaand = useMemo(() => {
    const m = new Map<string, { aantal: number; som: number }>();
    for (const it of items) {
      const key = it.transportdatum ? it.transportdatum.slice(0, 7) : 'onbekend';
      const g = m.get(key) ?? { aantal: 0, som: 0 };
      g.aantal++; g.som += it.bedrag ?? 0;
      m.set(key, g);
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'onbekend' ? 1 : b[0] === 'onbekend' ? -1 : a[0] < b[0] ? -1 : 1));
  }, [items]);

  const totaal = items.reduce((s, it) => s + (it.bedrag ?? 0), 0);

  if (laden) return <p style={{ color: 'var(--muted,#6b7280)', padding: 16 }}>Laden…</p>;
  if (!items.length) return <p style={{ color: 'var(--muted,#6b7280)', padding: 16 }}>Geen auto&apos;s in de pijplijn.</p>;

  const kaart = (titel: string, sub: string) => (
    <div style={{ border: '1px solid var(--border,#eee)', borderRadius: 12, padding: '10px 14px', minWidth: 120 }}>
      <div style={{ fontSize: 12, color: 'var(--muted,#6b7280)' }}>{titel}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ padding: 4 }}>
      <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--muted,#6b7280)' }}>
        Orderboek: <strong>{items.length}</strong> auto&apos;s · verwachte omzet <strong>{euro(totaal)}</strong>
      </div>

      <h4 style={{ margin: '16px 0 8px', fontSize: 13 }}>Per fase</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {FASE_VOLGORDE.map((f) => {
          const g = perFase.get(f);
          if (!g) return null;
          return <div key={f}>{kaart(`${FASE_LABEL[f]} (${g.aantal})`, euro(g.som))}</div>;
        })}
      </div>

      <h4 style={{ margin: '20px 0 8px', fontSize: 13 }}>Verwachte omzet per maand (leverdatum)</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {perMaand.map(([key, g]) => (
          <div key={key}>{kaart(`${key === 'onbekend' ? 'Nog te plannen' : maandLabel(key)} (${g.aantal})`, euro(g.som))}</div>
        ))}
      </div>

      <h4 style={{ margin: '20px 0 8px', fontSize: 13 }}>Auto&apos;s</h4>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--muted,#6b7280)' }}>
            <th style={{ padding: '6px 8px' }}>Klant</th>
            <th style={{ padding: '6px 8px' }}>Auto</th>
            <th style={{ padding: '6px 8px' }}>Fase</th>
            <th style={{ padding: '6px 8px' }}>Leverdatum</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Bedrag</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderTop: '1px solid var(--border,#f0f0f0)' }}>
              <td style={{ padding: '6px 8px' }}>{it.klant ?? '—'}</td>
              <td style={{ padding: '6px 8px' }}>{[it.merk, it.model].filter(Boolean).join(' ') || '—'}</td>
              <td style={{ padding: '6px 8px' }}>
                {FASE_LABEL[it.fase]}
                {!it.gekoppeld && <span style={{ color: 'var(--danger,#dc2626)', fontSize: 11 }}> ⚠</span>}
              </td>
              <td style={{ padding: '6px 8px' }}>{it.transportdatum ?? '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.bedrag != null ? euro(it.bedrag) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
