'use client';

import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import styles from './ConsignatieModal.module.css';

interface Props {
  open: boolean;
  onSluiten: () => void;
}

type KentekenType = 'personenauto' | 'bedrijfswagen';

interface Form {
  auto: string;
  kentekenType: KentekenType;
  verkoopprijs: string;
  garantie: string;
  poetsen: string;
  tanken: string;
  advDagen: string;
  rijklaar: string;
  accessoires: string;
  feePercent: string;
}

const LEEG: Form = {
  auto: '',
  kentekenType: 'personenauto',
  verkoopprijs: '',
  garantie: '',
  poetsen: '',
  tanken: '',
  advDagen: '',
  rijklaar: '',
  accessoires: '',
  feePercent: '4',
};

const BTW = 0.21;

const STAPPEN = [
  { key: 'auto',         label: 'Auto' },
  { key: 'garantie',     label: 'Garantie' },
  { key: 'poetsen',      label: 'Poetsen' },
  { key: 'tanken',       label: 'Tanken' },
  { key: 'advertentie',  label: 'Advert.' },
  { key: 'rijklaar',     label: 'Rijklaar' },
  { key: 'accessoires',  label: 'Access.' },
  { key: 'fee',          label: 'Fee' },
];

function parseG(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ConsignatieModal({ open, onSluiten }: Props) {
  const [form, setForm] = useState<Form>(LEEG);
  const [stap, setStap] = useState(0);
  const [klaar, setKlaar] = useState(false);

  function stel<K extends keyof Form>(veld: K, w: Form[K]) {
    setForm((f) => ({ ...f, [veld]: w }));
  }

  const cijfers = useMemo(() => {
    // Personenauto (geel kenteken): kosten worden ex btw ingevoerd en omgerekend naar incl btw
    // voor aftrek van een incl-prijs. Bedrijfswagen (grijs): alles ex btw, geen omrekening.
    const factor = form.kentekenType === 'personenauto' ? 1 + BTW : 1;
    const isIncl = form.kentekenType === 'personenauto';

    const vp = parseG(form.verkoopprijs);
    const dagen = parseInt(form.advDagen) || 0;
    const maanden = dagen === 0 ? 0 : Math.ceil(dagen / 30.44);

    const garantieEx = parseG(form.garantie);
    const poetsenEx = parseG(form.poetsen);
    const tankenEx = parseG(form.tanken);
    const advEx = maanden * 25;
    const rijklaarEx = parseG(form.rijklaar);
    const accessoiresEx = parseG(form.accessoires);

    // Bedragen na omrekening (gebruikt in eindberekening + weergave)
    const garantie = garantieEx * factor;
    const poetsen = poetsenEx * factor;
    const tanken = tankenEx * factor;
    const adv = advEx * factor;
    const rijklaar = rijklaarEx * factor;
    const accessoires = accessoiresEx * factor;

    const feeP = parseG(form.feePercent);
    const fee = vp * feeP / 100;
    const totaal = vp - garantie - poetsen - tanken - adv - rijklaar - accessoires - fee;

    return {
      vp, dagen, maanden,
      garantie, poetsen, tanken, adv, rijklaar, accessoires,
      garantieEx, poetsenEx, tankenEx, advEx, rijklaarEx, accessoiresEx,
      feeP, fee, totaal,
      factor, isIncl,
    };
  }, [form]);

  function volgende() {
    // Validatie stap 0
    if (stap === 0) {
      if (!form.auto.trim()) return alert('Vul een auto-naam of kenteken in.');
      if (cijfers.vp <= 0) return alert('Vul een verkoopprijs in.');
    }
    if (stap < STAPPEN.length - 1) {
      setStap(stap + 1);
    } else {
      setKlaar(true);
    }
  }

  function vorige() {
    setStap(Math.max(0, stap - 1));
  }

  function reset() {
    setForm(LEEG);
    setStap(0);
    setKlaar(false);
  }

  function handleSluiten() {
    reset();
    onSluiten();
  }

  async function downloadPDF() {
    // Laad logo en converteer naar data-URL voor jsPDF
    let logoDataUrl: string | null = null;
    let logoDims: { w: number; h: number } | null = null;
    try {
      const res = await fetch('/pepe-logo-rgb.png');
      const blob = await res.blob();
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      // Krijg de native dimensies om aspect ratio te behouden
      logoDims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = logoDataUrl!;
      });
    } catch {
      // fallback: geen logo
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const margin = 18;
    const col2 = W - margin;
    let y = 0;

    // Witte header met logo + accent lijn
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, 32, 'F');

    if (logoDataUrl && logoDims) {
      const targetH = 14;
      const targetW = (logoDims.w / logoDims.h) * targetH;
      doc.addImage(logoDataUrl, 'PNG', margin, 9, targetW, targetH);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(146, 25, 57);
      doc.text('PEPE', margin, 18);
    }

    // Tag rechts
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 25, 57);
    doc.text('CONSIGNATIE EINDAFREKENING', col2, 15, { align: 'right' });
    const datum = new Date().toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(122, 132, 144);
    doc.text(datum, col2, 21, { align: 'right' });

    // Accent lijn onder header
    doc.setFillColor(146, 25, 57);
    doc.rect(0, 32, W, 1.2, 'F');

    y = 33.2;

    // Hero (licht met accent left-border)
    doc.setFillColor(146, 25, 57);
    doc.rect(0, y, 4, 40, 'F');
    doc.setFillColor(252, 247, 249);
    doc.rect(4, y, W - 4, 40, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(146, 25, 57);
    doc.text('EINDAFREKENING VOOR KLANT', margin, y + 12);

    doc.setFontSize(22);
    doc.setTextColor(21, 28, 39);
    doc.text(form.auto.toUpperCase(), margin, y + 26);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(122, 132, 144);
    doc.text(cijfers.isIncl ? 'Personenauto · prijzen incl. btw/bpm' : 'Bedrijfswagen · prijzen excl. btw', margin, y + 35);

    y += 40 + 8;

    // Regels
    const vpLbl = cijfers.isIncl ? 'Verkoopprijs (incl. btw/bpm)' : 'Verkoopprijs (excl. btw)';
    const regels: { lbl: string; val: number; type: 'pos' | 'neg' | 'zero' }[] = [
      { lbl: vpLbl, val: cijfers.vp, type: 'pos' },
      { lbl: 'Garantie / herstelkosten', val: cijfers.garantie, type: cijfers.garantie ? 'neg' : 'zero' },
      { lbl: 'Poetsen', val: cijfers.poetsen, type: cijfers.poetsen ? 'neg' : 'zero' },
      { lbl: 'Tanken', val: cijfers.tanken, type: cijfers.tanken ? 'neg' : 'zero' },
      { lbl: `Advertentiekosten (${cijfers.maanden} mnd × €25)`, val: cijfers.adv, type: cijfers.adv ? 'neg' : 'zero' },
      { lbl: 'Rijklaar maken + keuring', val: cijfers.rijklaar, type: cijfers.rijklaar ? 'neg' : 'zero' },
      { lbl: 'Accessoires', val: cijfers.accessoires, type: cijfers.accessoires ? 'neg' : 'zero' },
      { lbl: `PEPE commissie ${cijfers.feeP}%`, val: cijfers.fee, type: cijfers.fee ? 'neg' : 'zero' },
    ];

    regels.forEach((r) => {
      const pfx = r.type === 'zero' ? '' : r.type === 'pos' ? '+ ' : '− ';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      if (r.type === 'zero') doc.setTextColor(180, 180, 186);
      else doc.setTextColor(90, 96, 106);
      doc.text(r.lbl, margin, y + 5.5);

      doc.setFont('helvetica', 'bold');
      if (r.type === 'pos') doc.setTextColor(22, 163, 74);
      else if (r.type === 'zero') doc.setTextColor(180, 180, 186);
      else doc.setTextColor(21, 28, 39);
      doc.text(`${pfx}€ ${fmtEuro(r.val)}`, col2, y + 5.5, { align: 'right' });

      doc.setDrawColor(232, 232, 236);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 10, col2, y + 10);
      y += 11.5;
    });

    // Totaal balk
    y += 6;
    doc.setFillColor(146, 25, 57);
    doc.rect(margin - 4, y, W - 2 * (margin - 4), 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('NETTO OPBRENGST KLANT', margin, y + 9);
    doc.setFontSize(18);
    doc.text(`€ ${fmtEuro(cijfers.totaal)}`, col2, y + 15, { align: 'right' });
    y += 22;

    // BTW-toelichting onder totaal
    y += 7;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(122, 132, 144);
    const toelichting = cijfers.isIncl
      ? 'Kosten zijn omgerekend van excl btw naar incl btw (×1,21) zodat alle bedragen in dezelfde basis staan.'
      : 'Bedrijfswagen — alle bedragen zijn excl btw.';
    doc.text(toelichting, margin, y, { maxWidth: W - 2 * margin });

    // Footer
    y = 278;
    doc.setDrawColor(146, 25, 57);
    doc.setLineWidth(0.6);
    doc.line(margin, y, col2, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(122, 132, 144);
    doc.text('PEPE Wagenparkbeheer', margin, y + 6);
    doc.text('pepewagenparkbeheer.nl', col2, y + 6, { align: 'right' });

    const safe = form.auto.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim().replace(/\s+/g, '-');
    doc.save(`PEPE-Eindafrekening-${safe}.pdf`);
  }

  if (!open) return null;

  // RESULTAAT-scherm
  if (klaar) {
    const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const vpLbl = cijfers.isIncl ? 'Verkoopprijs (incl. btw/bpm)' : 'Verkoopprijs (excl. btw)';
    const regels = [
      { lbl: vpLbl, val: cijfers.vp, type: 'pos', sep: false },
      { lbl: 'Garantie / herstelkosten', val: cijfers.garantie, type: cijfers.garantie ? 'neg' : 'zero', sep: true },
      { lbl: 'Poetsen', val: cijfers.poetsen, type: cijfers.poetsen ? 'neg' : 'zero', sep: false },
      { lbl: 'Tanken', val: cijfers.tanken, type: cijfers.tanken ? 'neg' : 'zero', sep: false },
      { lbl: `Advertentie (${cijfers.maanden} mnd × €25)`, val: cijfers.adv, type: cijfers.adv ? 'neg' : 'zero', sep: false },
      { lbl: 'Rijklaar maken + keuring', val: cijfers.rijklaar, type: cijfers.rijklaar ? 'neg' : 'zero', sep: false },
      { lbl: 'Accessoires', val: cijfers.accessoires, type: cijfers.accessoires ? 'neg' : 'zero', sep: false },
      { lbl: `PEPE commissie ${cijfers.feeP}%`, val: cijfers.fee, type: cijfers.fee ? 'neg' : 'zero', sep: false },
    ] as const;

    return (
      <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleSluiten()}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <div>
              <div className={styles.modalSub}>Consignatie · {datum}</div>
              <div className={styles.modalTitel}>📋 Eindafrekening</div>
            </div>
            <button className={styles.sluitKnop} onClick={handleSluiten}>×</button>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.hero}>
              <div className={styles.heroSub}>Eindafrekening voor klant</div>
              <div className={styles.heroAuto}>{form.auto || '—'}</div>
            </div>

            <div className={styles.regels}>
              {regels.map((r, i) => {
                const pfx = r.type === 'zero' ? '' : r.type === 'pos' ? '+ ' : '− ';
                const kleurCls = r.type === 'pos' ? styles.regelPos : r.type === 'neg' ? styles.regelNeg : styles.regelZero;
                return (
                  <div key={i} className={`${styles.regel} ${kleurCls} ${r.sep ? styles.regelSep : ''}`}>
                    <span className={styles.regelLbl}>{r.lbl}</span>
                    <span className={styles.regelVal}>{pfx}€ {fmtEuro(r.val)}</span>
                  </div>
                );
              })}
            </div>

            <div className={styles.totaal}>
              <span className={styles.totaalLbl}>Netto opbrengst klant</span>
              <span className={styles.totaalVal}>€ {fmtEuro(cijfers.totaal)}</span>
            </div>

            <p className={styles.uitleg} style={{ textAlign: 'center', marginTop: 4 }}>
              {cijfers.isIncl
                ? 'Kosten zijn omgerekend van excl btw naar incl btw (×1,21) zodat alle bedragen in dezelfde basis staan.'
                : 'Bedrijfswagen — alle bedragen zijn excl btw.'}
            </p>
          </div>

          <div className={styles.modalFooter}>
            <button className="btn" onClick={reset}>+ Nieuwe afrekening</button>
            <button className="btn btn-a" onClick={downloadPDF}>⬇ Download PDF</button>
          </div>
        </div>
      </div>
    );
  }

  // WIZARD-scherm
  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleSluiten()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalSub}>Tools · Stap {stap + 1} van {STAPPEN.length}</div>
            <div className={styles.modalTitel}>📋 Consignatie eindafrekening</div>
          </div>
          <button className={styles.sluitKnop} onClick={handleSluiten}>×</button>
        </div>

        <div className={styles.stepNav}>
          {STAPPEN.map((s, i) => (
            <div
              key={s.key}
              className={`${styles.stepItem} ${i === stap ? styles.stepActief : ''} ${i < stap ? styles.stepDone : ''}`}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepLabel}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className={styles.modalBody}>
          {stap === 0 && (
            <>
              <div className={styles.fg}>
                <label>Type kenteken</label>
                <div className={styles.chipGroep}>
                  <button
                    type="button"
                    className={`${styles.chip} ${form.kentekenType === 'personenauto' ? styles.chipActief : ''}`}
                    onClick={() => stel('kentekenType', 'personenauto')}
                  >🟨 Personenauto</button>
                  <button
                    type="button"
                    className={`${styles.chip} ${form.kentekenType === 'bedrijfswagen' ? styles.chipActief : ''}`}
                    onClick={() => stel('kentekenType', 'bedrijfswagen')}
                  >⬜ Bedrijfswagen (grijs)</button>
                </div>
                <p className={styles.uitleg}>
                  {form.kentekenType === 'personenauto'
                    ? 'Verkoopprijs is incl. btw/bpm; kosten worden ex btw ingevoerd en automatisch omgerekend naar incl btw in de eindrekening.'
                    : 'Alle bedragen zijn excl. btw — geen omrekening.'}
                </p>
              </div>
              <div className={styles.fg}>
                <label>Auto (merk, model of kenteken)</label>
                <input className="fi" placeholder="bijv. Tesla Model 3, AB-123-C" value={form.auto} onChange={(e) => stel('auto', e.target.value)} />
              </div>
              <div className={styles.fg}>
                <label>
                  Verkoopprijs{' '}
                  <span className={form.kentekenType === 'personenauto' ? styles.btwBadge : styles.btwBadgeExcl}>
                    {form.kentekenType === 'personenauto' ? 'incl. btw / bpm' : 'excl. btw'}
                  </span>
                </label>
                <EuroInput value={form.verkoopprijs} onChange={(v) => stel('verkoopprijs', v)} placeholder="70000" />
              </div>
            </>
          )}

          {stap === 1 && (
            <div className={styles.fg}>
              <label>Garantie / herstelkosten <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.garantie} onChange={(v) => stel('garantie', v)} />
              <p className={styles.uitleg}>Kosten door garantieclaims of herstelwerk na de verkoop. Vul 0 in als niet van toepassing.</p>
            </div>
          )}

          {stap === 2 && (
            <div className={styles.fg}>
              <label>Kosten poetsen <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.poetsen} onChange={(v) => stel('poetsen', v)} />
              <p className={styles.uitleg}>Kosten voor het poetsen of reinigen van de auto.</p>
            </div>
          )}

          {stap === 3 && (
            <div className={styles.fg}>
              <label>Kosten tanken <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.tanken} onChange={(v) => stel('tanken', v)} />
              <p className={styles.uitleg}>Uitgegeven aan brandstof voor deze auto.</p>
            </div>
          )}

          {stap === 4 && (
            <>
              <div className={styles.fg}>
                <label>Dagen te koop gestaan</label>
                <div className={styles.inputWrap}>
                  <input
                    className="fi"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.advDagen}
                    onChange={(e) => stel('advDagen', e.target.value)}
                    style={{ paddingRight: 50 }}
                  />
                  <span className={styles.sfx}>dagen</span>
                </div>
                <p className={styles.uitleg}>Kosten zijn €25 per maand (naar boven afgerond, 30,44 dagen per maand).</p>
              </div>
              {cijfers.dagen > 0 && (
                <div className={styles.calcBox}>
                  <div className={styles.calcRow}><span>Aantal dagen</span><span>{cijfers.dagen}</span></div>
                  <div className={styles.calcRow}><span>Afgeronde maanden</span><span>{cijfers.maanden}</span></div>
                  <div className={`${styles.calcRow} ${styles.calcTotaal}`}><span>Advertentiekosten</span><span>€ {fmtEuro(cijfers.adv)}</span></div>
                </div>
              )}
            </>
          )}

          {stap === 5 && (
            <div className={styles.fg}>
              <label>Rijklaar maken + keuring <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.rijklaar} onChange={(v) => stel('rijklaar', v)} />
              <p className={styles.uitleg}>APK, kleine reparaties, banden of overige werkzaamheden.</p>
            </div>
          )}

          {stap === 6 && (
            <div className={styles.fg}>
              <label>Kosten accessoires <span className={styles.btwBadgeExcl}>excl. btw</span></label>
              <EuroInput value={form.accessoires} onChange={(v) => stel('accessoires', v)} />
              <p className={styles.uitleg}>Extra accessoires (matten, trekhaak, dakdragers, etc.).</p>
            </div>
          )}

          {stap === 7 && (
            <>
              <div className={styles.fg}>
                <label>PEPE commissie</label>
                <div className={styles.inputWrap}>
                  <input
                    className="fi"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="4"
                    value={form.feePercent}
                    onChange={(e) => stel('feePercent', e.target.value)}
                    style={{ paddingRight: 28 }}
                  />
                  <span className={styles.sfx}>%</span>
                </div>
                <p className={styles.uitleg}>Welk percentage rekent PEPE als commissie over de verkoopprijs?</p>
              </div>
              <div className={styles.feeLive}>
                <span>Fee bedrag (over verkoopprijs)</span>
                <strong>€ {fmtEuro(cijfers.fee)}</strong>
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          {stap > 0 && <button className="btn" onClick={vorige}>← Terug</button>}
          <button className="btn btn-a" onClick={volgende}>
            {stap === STAPPEN.length - 1 ? 'Bereken afrekening →' : 'Volgende →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sub-component voor euro-input
function EuroInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontWeight: 600, pointerEvents: 'none' }}>€</span>
      <input
        className="fi"
        type="number"
        min={0}
        step={1}
        placeholder={placeholder ?? '0'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: 28, width: '100%' }}
      />
    </div>
  );
}
