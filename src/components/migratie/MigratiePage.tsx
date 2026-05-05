'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = { label: string; ok: number; fout: number; overgeslagen: number };

function nieuweId() { return crypto.randomUUID(); }

function mapZoeken(r: Record<string, unknown>) {
  return {
    klant:              r.klant ?? '',
    auto:               r.auto ?? '',
    details:            r.details ?? '',
    km:                 r.km ?? '',
    jaar:               r.jaar ?? '',
    budget:             r.budget ?? '',
    btw:                r.btw ?? '',
    wiezoekt:           r.wiezoekt ?? '',
    email_klant:        r.email_klant ?? r.email ?? '',
    opmerkingen:        r.opmerkingen ?? '',
    as_email:           r.as_email ?? '',
    terugkoppeling_txt: r.terugkoppeling_txt ?? '',
    kleuren:            Array.isArray(r.kleuren) ? r.kleuren : [],
    opties:             (r.opties && typeof r.opties === 'object') ? r.opties : {},
    brandstof:          Array.isArray(r.brandstof) ? r.brandstof : [],
    uitgewerkt:         !!r.uitgewerkt,
    terugkoppeling:     !!r.terugkoppeling,
    dealer:             !!r.dealer,
    inkopen:            !!r.inkopen,
    contract:           !!r.contract,
    akkoord:            !!r.akkoord,
    akkoord_door:       r.akkoord_door ?? null,
    akkoord_datum:      r.akkoord_datum ?? null,
    prio:               !!r.prio,
    uitgesteld:         !!r.uitgesteld,
  };
}

function mapAfterSales(r: Record<string, unknown>) {
  return {
    id:               (typeof r.id === 'string' && r.id.includes('-')) ? r.id : nieuweId(),
    kenteken:         r.kenteken ?? 'NNB',
    merk:             r.merk ?? '',
    model:            r.model ?? '',
    klant:            r.klant ?? '',
    type:             r.type ?? 'nl',
    wie_levert_af:    r.wie_levert_af ?? null,
    afleverdatum:     r.gepland_datum ?? r.afleverdatum ?? null,
    binnen:           !!(r.imp_transport_binnen ?? r.binnen),
    aflevercontrole:  !!r.aflevercontrole,
    klaar:            !!(r.as_rijklaar ?? r.klaar),
    gearchiveerd:     !!r.gearchiveerd,
    afgeleverd_op:    r.afgeleverd_op ?? null,
    wie_heeft_afgeleverd: r.wie_heeft_afgeleverd ?? null,
    aangevraagd:      !!r.aangevraagd,
    betaald:          !!r.betaald,
    rdw_ingeschreven: !!r.rdw_ingeschreven,
    bpm_ingediend:    !!r.bpm_ingediend,
    bpm_goedgekeurd:  !!r.bpm_goedgekeurd,
    bin_ontvangen:    !!r.bin_ontvangen,
    kentekenbewijzen: !!r.kentekenbewijzen,
    gelangenbest:     !!r.gelangenbest,
    notitie:          r.notitie ?? r.opmerkingen ?? null,
    apk:              r.rdw_apk_datum ?? r.apk ?? null,
    terugroep:        r.terugroep ?? (r.rdw_recalls ? String(r.rdw_recalls) : null),
    status:           r.status ?? null,
  };
}

function mapKlacht(r: Record<string, unknown>, oldIdNieuweId: Record<string, string>) {
  const oudAutoId = typeof r.auto_id === 'string' ? r.auto_id : '';
  return {
    id:          (typeof r.id === 'string' && r.id.includes('-')) ? r.id : nieuweId(),
    auto_id:     oldIdNieuweId[oudAutoId] ?? oudAutoId,
    kenteken:    r.kenteken ?? '',
    merk_model:  r.auto ?? r.merk_model ?? '',
    klant:       r.klant ?? '',
    omschrijving: r.omschrijving ?? '',
    oplossing:   r.oplossing ?? null,
    status:      (r.status === 'opgelost' ? 'opgelost' : r.status === 'in_behandeling' ? 'in_behandeling' : 'open') as 'open' | 'in_behandeling' | 'opgelost',
    opgelost_op: r.opgelost_op ?? null,
    door_wie:    r.door_wie ?? null,
  };
}

function mapLease(r: Record<string, unknown>) {
  return {
    id:                    (typeof r.id === 'string' && r.id.includes('-')) ? r.id : nieuweId(),
    klant_naam:            r.klant_naam ?? r.klant ?? '',
    berijder:              r.berijder ?? null,
    merk:                  r.merk ?? '',
    model:                 r.model ?? '',
    leasemaatschappij:     r.leasemaatschappij ?? null,
    leasenormbedrag:       r.leasenormbedrag ? Number(r.leasenormbedrag) : null,
    leasetarief:           r.leasetarief ? Number(r.leasetarief) : null,
    verdiensten_lm:        r.verdiensten_lm ? Number(r.verdiensten_lm) : null,
    verdiensten_dealer:    r.verdiensten_dealer ? Number(r.verdiensten_dealer) : null,
    looptijd:              r.looptijd ?? null,
    jaarkilometrage:       r.jaarkilometrage ?? null,
    inkoper:               r.inkoper ?? null,
    offerte_verstuurd:     !!r.offerte_verstuurd,
    verwachte_leverdatum:  r.verwachte_leverdatum ?? null,
    notities:              r.notities ?? null,
    akkoord:               !!r.akkoord,
    akkoord_door:          r.akkoord_door ?? null,
    akkoord_datum:         r.akkoord_datum ?? null,
    verkocht:              !!r.verkocht,
    verkocht_op:           r.verkocht_op ?? null,
    in_btw_lijst:          !!r.in_btw_lijst,
  };
}

export default function MigratiePage() {
  const [invoer, setInvoer] = useState('');
  const [bezig, setBezig] = useState(false);
  const [statussen, setStatussen] = useState<Status[]>([]);
  const [klaar, setKlaar] = useState(false);

  const EXPORT_SCRIPT = `JSON.stringify({zoeken:JSON.parse(localStorage.getItem('asp_v5')||'[]'),afterSales:JSON.parse(localStorage.getItem('asp_as_v1')||'[]'),klachten:JSON.parse(localStorage.getItem('asp_nal_v1')||'[]'),lease:JSON.parse(localStorage.getItem('asp_lease_v1')||'[]')})`;

  async function importeer() {
    if (!invoer.trim()) return;
    setBezig(true);
    setStatussen([]);
    setKlaar(false);

    let parsed: Record<string, unknown[]>;
    try {
      parsed = JSON.parse(invoer);
    } catch {
      setStatussen([{ label: 'JSON fout — controleer de geplakte tekst', ok: 0, fout: 1, overgeslagen: 0 }]);
      setBezig(false);
      return;
    }

    const nieuw: Status[] = [];

    // ── Zoekopdrachten ──────────────────────────────────────────
    const zoekRijen = (parsed.zoeken ?? []) as Record<string, unknown>[];
    if (zoekRijen.length) {
      const mapped = zoekRijen.map(mapZoeken);
      const { error } = await supabase.from('zoekopdrachten').insert(mapped);
      nieuw.push({ label: 'Zoekopdrachten', ok: error ? 0 : mapped.length, fout: error ? mapped.length : 0, overgeslagen: 0 });
    }

    // ── AfterSales ──────────────────────────────────────────────
    const asRijen = (parsed.afterSales ?? []) as Record<string, unknown>[];
    const oldNieuwMap: Record<string, string> = {};
    if (asRijen.length) {
      let ok = 0; let fout = 0;
      for (const r of asRijen) {
        const mapped = mapAfterSales(r);
        const oudId = String(r.id ?? '');
        if (oudId) oldNieuwMap[oudId] = mapped.id;
        const { error } = await supabase.from('after_sales').insert(mapped);
        if (error) fout++; else ok++;
      }
      nieuw.push({ label: 'After Sales', ok, fout, overgeslagen: 0 });
    }

    // ── Klachten ────────────────────────────────────────────────
    const nalRijen = (parsed.klachten ?? []) as Record<string, unknown>[];
    if (nalRijen.length) {
      let ok = 0; let fout = 0;
      for (const r of nalRijen) {
        const mapped = mapKlacht(r, oldNieuwMap);
        const { error } = await supabase.from('as_klachten').insert(mapped);
        if (error) fout++; else ok++;
      }
      nieuw.push({ label: 'Klachten / Nalevering', ok, fout, overgeslagen: 0 });
    }

    // ── Lease ───────────────────────────────────────────────────
    const leaseRijen = (parsed.lease ?? []) as Record<string, unknown>[];
    if (leaseRijen.length) {
      let ok = 0; let fout = 0;
      for (const r of leaseRijen) {
        const mapped = mapLease(r);
        const { error } = await supabase.from('lease_aanvragen').insert(mapped);
        if (error) fout++; else ok++;
      }
      nieuw.push({ label: 'Lease aanvragen', ok, fout, overgeslagen: 0 });
    }

    setStatussen(nieuw);
    setKlaar(true);
    setBezig(false);
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Data migratie</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Zet alle data van de oude HTML app over naar de nieuwe omgeving.</p>

      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Stap 1 — Exporteer data uit de oude app</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Open de oude HTML app op <strong>flow.pepewagenparkbeheer.nl/index.html</strong> (of lokaal), druk op <strong>F12</strong> → tabblad <strong>Console</strong>, plak dit commando en druk op Enter:
        </p>
        <div style={{ position: 'relative' }}>
          <pre style={{
            background: '#0f1117', color: '#a5d6a7', borderRadius: 8, padding: '12px 16px',
            fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            marginBottom: 8,
          }}>{EXPORT_SCRIPT}</pre>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Kopieer de volledige output (begint met {"{"} en eindigt met {"}"}).</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Stap 2 — Plak de output hier</div>
        <textarea
          style={{
            width: '100%', minHeight: 140, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 12, fontFamily: 'monospace',
            resize: 'vertical', boxSizing: 'border-box',
          }}
          placeholder='{"zoeken":[...],"afterSales":[...],"klachten":[...],"lease":[...]}'
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          disabled={bezig}
        />
      </div>

      <button
        className="btn btn-a"
        onClick={importeer}
        disabled={bezig || !invoer.trim()}
        style={{ marginBottom: 24 }}
      >
        {bezig ? '⏳ Bezig met importeren...' : '🚀 Importeer alles naar Supabase'}
      </button>

      {statussen.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {statussen.map((s) => (
            <div key={s.label} style={{
              background: s.fout > 0 ? 'rgba(220,38,38,.08)' : 'rgba(22,163,74,.08)',
              border: `1px solid ${s.fout > 0 ? 'rgba(220,38,38,.3)' : 'rgba(22,163,74,.3)'}`,
              borderRadius: 8, padding: '10px 16px', display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {s.ok > 0 && <span style={{ color: '#16a34a' }}>✓ {s.ok} geïmporteerd</span>}
                {s.fout > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>✗ {s.fout} mislukt</span>}
              </span>
            </div>
          ))}
          {klaar && statussen.every(s => s.fout === 0) && (
            <div style={{ marginTop: 8, color: '#16a34a', fontWeight: 700 }}>
              ✅ Alle data succesvol overgezet! Je kunt nu de normale app gebruiken.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
