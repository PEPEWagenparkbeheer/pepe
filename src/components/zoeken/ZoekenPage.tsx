'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useBtw } from '@/hooks/useBtw';
import { useZoekopdrachten } from '@/hooks/useZoekopdrachten';
import { supabase } from '@/lib/supabase';
import { schietConfetti } from '@/lib/confetti';
import type { Zoekopdracht } from '@/types';
import type { AutoType, BrutoNetto } from './AkkoordModal';
import AkkoordModal from './AkkoordModal';
import KoppelFactuurModal from '@/components/facturatie/KoppelFactuurModal';
import ZoekenFilters, { type FilterOptie } from './ZoekenFilters';
import ZoekenKPI from './ZoekenKPI';
import ZoekenModal from './ZoekenModal';
import ZoekenTable, { type SortVeld } from './ZoekenTable';
import styles from './ZoekenPage.module.css';

function exportCsv(rijen: Zoekopdracht[]) {
  const headers = ['Klant', 'E-mail klant', 'Auto', 'Details', 'Budget', 'BTW', 'Km', 'Jaar', 'Wie zoekt', 'Kleuren', 'Brandstof', 'Uitgewerkt', 'Terugkoppeling', 'Terugkoppeling notitie', 'Dealer', 'Inkopen', 'Contract', 'Akkoord', 'Opmerkingen', 'Aangemaakt', 'Gewenste rijdatum'];
  const rows = rijen.map((r) => [
    r.klant, r.email_klant ?? '', r.auto, r.details ?? '', r.budget ?? '', r.btw ?? '', r.km ?? '', r.jaar ?? '', r.wiezoekt ?? '',
    (r.kleuren ?? []).join(';'), (r.brandstof ?? []).join(';'),
    r.uitgewerkt ? 'Ja' : '', r.terugkoppeling ? 'Ja' : '', r.terugkoppeling_txt ?? '', r.dealer ? 'Ja' : '',
    r.inkopen ? 'Ja' : '', r.contract ? 'Ja' : '', r.akkoord ? 'Ja' : '', r.opmerkingen ?? '',
    r.created_at ? new Date(r.created_at).toLocaleDateString('nl-NL') : '',
    r.gewenste_rijdatum ?? '',
  ]);
  const csv = '﻿' + [headers, ...rows].map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'zoekopdrachten.csv';
  a.click();
}

export default function ZoekenPage() {
  const { records, loading, add, update, remove, togglePrio, quickToggle } = useZoekopdrachten();
  const { add: addBtw } = useBtw();
  const { user } = useAuth();

  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterOptie>(
    (searchParams.get('filter') as FilterOptie) || 'actueel'
  );
  const [zoekterm, setZoekterm] = useState('');
  const [sortVeld, setSortVeld] = useState<SortVeld>(null);
  const [sortRichting, setSortRichting] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Zoekopdracht | null>(null);
  const [akkoordRecord, setAkkoordRecord] = useState<Zoekopdracht | null>(null);
  const [koppelAuto, setKoppelAuto] = useState<{ id: string; klant: string } | null>(null);

  const rijen = useMemo(() => {
    const q = zoekterm.toLowerCase();
    let gefilterd = records.filter((r) => {
      if (q && !`${r.klant} ${r.auto} ${r.details ?? ''} ${r.opmerkingen ?? ''} ${r.email_klant ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'actueel') return !r.akkoord && !r.uitgesteld;
      if (filter === 'prio') return !!r.prio && !r.akkoord && !r.uitgesteld;
      if (filter === 'terugkoppeling') return !!r.uitgewerkt && !r.terugkoppeling && !r.akkoord && !r.uitgesteld;
      if (filter === 'uitgesteld') return !!r.uitgesteld;
      if (filter === 'akkoord' || filter === 'archief') return !!r.akkoord;
      return !r.akkoord && !r.uitgesteld;
    });
    if (sortVeld) {
      gefilterd = [...gefilterd].sort((a, b) => {
        const va = String(a[sortVeld] ?? '').toLowerCase();
        const vb = String(b[sortVeld] ?? '').toLowerCase();
        return sortRichting === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    gefilterd.sort((a, b) => (b.prio ? 1 : 0) - (a.prio ? 1 : 0));
    return gefilterd;
  }, [records, filter, zoekterm, sortVeld, sortRichting]);

  function handleSort(veld: SortVeld) {
    if (sortVeld === veld) setSortRichting((r) => (r === 'asc' ? 'desc' : 'asc'));
    else { setSortVeld(veld); setSortRichting('asc'); }
  }

  async function handleOpslaan(rec: Zoekopdracht | Omit<Zoekopdracht, 'id'>) {
    if ('id' in rec) await update(rec);
    else await add(rec);
  }

  async function handleAkkoordBevestig(
    rec: Zoekopdracht,
    _bijzonderheden: string,
    autoType: AutoType,
    dealer: string,
    btwBedrag: string,
    brutoNetto: BrutoNetto,
    ookAfterSales: boolean,
  ) {
    const naam = user?.email?.split('@')[0] ?? user?.email ?? '';
    await update({
      ...rec,
      akkoord: true,
      akkoord_door: naam,
      akkoord_datum: new Date().toISOString().slice(0, 10),
    });

    if (autoType === 'import' && brutoNetto === 'bruto') {
      await addBtw({
        auto: rec.auto,
        type: 'btw',
        klant: rec.klant,
        dealer_verkoper: dealer || undefined,
        bedrag: btwBedrag ? parseFloat(btwBedrag) : undefined,
        ingekocht_op: new Date().toISOString().slice(0, 10),
        inkoper: naam || undefined,
        gearchiveerd: false,
      });
    } else if (autoType === 'nieuw') {
      await addBtw({
        auto: rec.auto,
        type: 'credit',
        klant: rec.klant,
        dealer_verkoper: dealer || undefined,
        ingekocht_op: new Date().toISOString().slice(0, 10),
        inkoper: naam || undefined,
        gearchiveerd: false,
      });
    }

    let nieuwAfterSalesId: string | null = null;
    if (ookAfterSales) {
      const delen = rec.auto.trim().split(/\s+/);
      const { data: asRow } = await supabase.from('after_sales').insert({
        kenteken: '',
        merk: delen[0] ?? '',
        model: delen.slice(1).join(' '),
        klant: rec.klant,
        email_klant: rec.email_klant ?? null,
        type: autoType === 'voorraad' ? 'voorraad' : autoType === 'import' ? 'import' : 'nl',
        binnen: false,
        gearchiveerd: false,
      }).select('id').single();
      nieuwAfterSalesId = asRow?.id ?? null;
    }

    schietConfetti();
    setAkkoordRecord(null);

    // Import-auto: bied direct aan de bijbehorende geparkeerde DocuSign-factuur te koppelen
    // (met klantnaam-suggestie). "Komt later" is geldig — koppelen kan ook vanuit after-sales.
    if (autoType === 'import' && nieuwAfterSalesId) {
      setKoppelAuto({ id: nieuwAfterSalesId, klant: rec.klant });
    }
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.toolbar}>
        <h1 className={styles.paginaTitel}>Zoekopdrachten</h1>
        <input
          className={styles.zoekbalk}
          placeholder="Zoeken..."
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
        />
        <button className="btn" onClick={() => exportCsv(rijen)}>
          ↓ Export
        </button>
        <button className="btn btn-a" onClick={() => { setEditRecord(null); setModalOpen(true); }}>
          + Nieuwe opdracht
        </button>
      </div>

      <ZoekenKPI records={records} onFilter={setFilter} />
      <ZoekenFilters actief={filter} records={records} onChange={setFilter} />

      {loading ? (
        <div className={styles.laden}>Gegevens worden geladen...</div>
      ) : (
        <ZoekenTable
          rows={rijen}
          sortVeld={sortVeld}
          sortRichting={sortRichting}
          onSort={handleSort}
          onEdit={(rec) => { setEditRecord(rec); setModalOpen(true); }}
          onQuickToggle={quickToggle}
          onTogglePrio={togglePrio}
          onAkkoord={(id) => {
            const rec = records.find((r) => r.id === id);
            if (rec) setAkkoordRecord(rec);
          }}
          onTerugzetten={(rec) => update({ ...rec, akkoord: false, akkoord_door: undefined, akkoord_datum: undefined })}
        />
      )}

      <ZoekenModal
        record={editRecord}
        open={modalOpen}
        onSluiten={() => setModalOpen(false)}
        onOpslaan={handleOpslaan}
        onVerwijder={remove}
      />

      <AkkoordModal
        key={akkoordRecord?.id}
        record={akkoordRecord}
        open={!!akkoordRecord}
        onBevestig={handleAkkoordBevestig}
        onSluiten={() => setAkkoordRecord(null)}
      />
      {koppelAuto && (
        <KoppelFactuurModal
          afterSalesId={koppelAuto.id}
          klantNaam={koppelAuto.klant}
          onSluiten={() => setKoppelAuto(null)}
        />
      )}
    </div>
  );
}
