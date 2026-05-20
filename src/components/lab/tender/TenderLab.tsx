'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { TenderInput, Tender } from '@/lib/types/tender';
import TenderConfirmModal from './TenderConfirmModal';
import styles from './TenderLab.module.css';

type Fase = 'invoer' | 'bezig' | 'bevestigen';

export default function TenderLab() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fase, setFase] = useState<Fase>('invoer');
  const [fout, setFout] = useState<string | null>(null);
  const [parsed, setParsed] = useState<TenderInput | null>(null);
  const [rawEmail, setRawEmail] = useState('');

  const [inbox, setInbox] = useState<Tender[]>([]);
  const [verwerkt, setVerwerkt] = useState<Tender[]>([]);
  const [inboxLaden, setInboxLaden] = useState(true);

  // Laad pending tenders + realtime updates
  useEffect(() => {
    let actief = true;

    async function laad() {
      const [pendingRes, doneRes] = await Promise.all([
        supabase
          .from('tenders')
          .select('*')
          .in('status', ['pending', 'failed'])
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('tenders')
          .select('*')
          .in('status', ['running', 'done', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (actief) {
        setInbox((pendingRes.data as Tender[]) ?? []);
        setVerwerkt((doneRes.data as Tender[]) ?? []);
        setInboxLaden(false);
      }
    }
    laad();

    const ch = supabase
      .channel(`tenders_${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenders' }, () => laad())
      .subscribe();

    return () => {
      actief = false;
      supabase.removeChannel(ch);
    };
  }, []);

  async function parseEmail(text?: string) {
    const tekst = text ?? email;
    setFout(null);
    if (!tekst.trim()) {
      setFout('Plak eerst een aanvraagmail of selecteer er een uit de inbox.');
      return;
    }
    setFase('bezig');
    try {
      const res = await fetch('/api/parse-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: tekst }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFout(data.error ?? 'Onbekende fout bij parsen');
        setFase('invoer');
        return;
      }
      if (data.geen_aanvraag) {
        setFout('Groq herkende dit niet als lease-aanvraag.');
        setFase('invoer');
        return;
      }
      setParsed(data.parsed as TenderInput);
      setRawEmail(tekst);
      setFase('bevestigen');
    } catch (e) {
      setFout('Netwerk-fout: ' + (e as Error).message);
      setFase('invoer');
    }
  }

  function openInbox(t: Tender) {
    if (t.parsed_data) {
      setParsed(t.parsed_data);
      setRawEmail(t.raw_email ?? '');
      setFase('bevestigen');
    } else {
      // Fallback: open in plak-veld en parse opnieuw
      setEmail(t.raw_email ?? '');
      parseEmail(t.raw_email ?? '');
    }
  }

  async function archiveer(t: Tender) {
    if (!confirm(`Aanvraag van ${t.klant_naam ?? 'onbekend'} archiveren?`)) return;
    await supabase.from('tenders').update({ status: 'done' }).eq('id', t.id);
  }

  function reset() {
    setEmail('');
    setParsed(null);
    setRawEmail('');
    setFase('invoer');
    setFout(null);
  }

  return (
    <div className={styles.pagina}>
      <div className={styles.kop}>
        <div className={styles.labBadge}>LAB</div>
        <h1 className={styles.titel}>Lease Tender</h1>
        <p className={styles.sub}>
          Aanvraagmails komen automatisch binnen via Postmark, of plak ze handmatig in.
          Groq parseert, jij controleert. Dit is een test-omgeving — nog niet gekoppeld aan de Lease-module.
        </p>
      </div>

      {/* Inbox van doorgestuurde mails */}
      <div className={styles.card}>
        <div className={styles.cardKop}>
          <div className={styles.cardTitel}>📬 Inbox doorgestuurde aanvragen</div>
          <span className={styles.aantal}>{inboxLaden ? '…' : `${inbox.length} pending`}</span>
        </div>
        {inboxLaden ? (
          <div className={styles.placeholder}>Laden…</div>
        ) : inbox.length === 0 ? (
          <div className={styles.placeholder}>Nog geen inkomende aanvragen. Stuur een mail naar het Postmark-adres of plak hieronder handmatig in.</div>
        ) : (
          <div className={styles.inboxLijst}>
            {inbox.map((t) => (
              <div key={t.id} className={styles.inboxRij}>
                <div className={styles.inboxInfo} onClick={() => openInbox(t)}>
                  <div className={styles.inboxNaam}>
                    {t.klant_naam || 'Onbekend'}
                    {t.status === 'failed' && <span className={styles.failedBadge}>parse-fout</span>}
                  </div>
                  <div className={styles.inboxAuto}>
                    {t.parsed_data?.merk} {t.parsed_data?.model}
                    {t.klant_email && <span className={styles.inboxMeta}> · {t.klant_email}</span>}
                  </div>
                  <div className={styles.inboxDatum}>
                    {t.created_at ? new Date(t.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
                <div className={styles.inboxActies}>
                  <button className="btn" onClick={() => openInbox(t)}>Open →</button>
                  <button className={styles.archiefKnop} onClick={() => archiveer(t)} title="Archiveer">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verwerkte tenders */}
      {verwerkt.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardKop}>
            <div className={styles.cardTitel}>📊 Verwerkte vergelijkingen</div>
            <span className={styles.aantal}>{verwerkt.length}</span>
          </div>
          <div className={styles.inboxLijst}>
            {verwerkt.map((t) => (
              <div key={t.id} className={styles.inboxRij}>
                <div className={styles.inboxInfo} onClick={() => router.push(`/lab/tender/${t.id}`)}>
                  <div className={styles.inboxNaam}>
                    {t.klant_naam || 'Onbekend'}
                    <span className={`${styles.failedBadge} ${t.status === 'done' ? styles.doneBadge : ''}`}>{t.status}</span>
                  </div>
                  <div className={styles.inboxAuto}>
                    {t.parsed_data?.merk} {t.parsed_data?.model}
                  </div>
                  <div className={styles.inboxDatum}>
                    {t.created_at ? new Date(t.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
                <div className={styles.inboxActies}>
                  <button className="btn" onClick={() => router.push(`/lab/tender/${t.id}`)}>Bekijk →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handmatige plak-input */}
      <div className={styles.card}>
        <div className={styles.cardKop}>
          <div className={styles.cardTitel}>📝 Handmatig plakken</div>
        </div>
        <div className={styles.fg}>
          <label>Aanvraagmail (plak de hele tekst inclusief eventuele forwarding-header)</label>
          <textarea
            className="fi"
            placeholder="Plak hier de inkomende mail van de klant..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rows={12}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
            disabled={fase === 'bezig'}
          />
        </div>

        {fout && <div className={styles.fout}>{fout}</div>}

        <div className={styles.actions}>
          <button
            className="btn btn-a"
            onClick={() => parseEmail()}
            disabled={fase === 'bezig' || !email.trim()}
          >
            {fase === 'bezig' ? 'Groq parseert...' : 'Parse aanvraag'}
          </button>
          {email && fase === 'invoer' && (
            <button className="btn" onClick={() => setEmail('')}>Wissen</button>
          )}
        </div>
      </div>

      {fase === 'bevestigen' && parsed && (
        <TenderConfirmModal
          input={parsed}
          rawEmail={rawEmail}
          onSluiten={() => setFase('invoer')}
          onReset={reset}
        />
      )}
    </div>
  );
}
