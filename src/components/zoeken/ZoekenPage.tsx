'use client';

import { useMemo, useState } from 'react';
import { useZoekopdrachten } from '@/hooks/useZoekopdrachten';
import { schietConfetti } from '@/lib/confetti';
import type { Zoekopdracht } from '@/types';
import AkkoordModal from './AkkoordModal';
import ZoekenFilters, { type FilterOptie } from './ZoekenFilters';
import ZoekenKPI from './ZoekenKPI';
import ZoekenModal from './ZoekenModal';
import ZoekenTable, { type SortVeld } from './ZoekenTable';
import styles from './ZoekenPage.module.css';

export default function ZoekenPage() {
  const { records, loading, add, update, remove, togglePrio, quickToggle } = useZoekopdrachten();

  const [filter, setFilter] = useState<FilterOptie>('actueel');
  const [zoekterm, setZoekterm] = useState('');
  const [sortVeld, setSortVeld] = useState<SortVeld>(null);
  const [sortRichting, setSortRichting] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Zoekopdracht | null>(null);
  const [akkoordRecord, setAkkoordRecord] = useState<Zoekopdracht | null>(null);

  const rijen = useMemo(() => {
    const q = zoekterm.toLowerCase();
    let gefilterd = records.filter((r) => {
      if (q && !`${r.klant} ${r.auto} ${r.details ?? ''} ${r.opmerkingen ?? ''} ${r.email_klant ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'actueel') return !r.akkoord && !r.uitgesteld;
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

  async function handleAkkoordBevestig(rec: Zoekopdracht) {
    await update({
      ...rec,
      akkoord: true,
      akkoord_datum: new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }),
    });
    schietConfetti();
    setAkkoordRecord(null);
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
        <button className="btn btn-a" onClick={() => { setEditRecord(null); setModalOpen(true); }}>
          + Nieuwe opdracht
        </button>
      </div>

      <ZoekenKPI records={records} />
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
        record={akkoordRecord}
        open={!!akkoordRecord}
        onBevestig={handleAkkoordBevestig}
        onSluiten={() => setAkkoordRecord(null)}
      />
    </div>
  );
}
