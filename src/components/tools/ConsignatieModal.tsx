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

// Laad witte PEPE-logo SVG, render naar high-res PNG voor crisp PDF embedding
async function loadWitLogoAsPng(): Promise<{ data: string; aspect: number } | null> {
  try {
    const res = await fetch('/pepe-logo-cmyk-wit.svg');
    let svgText = await res.text();

    // Bepaal aspect ratio uit viewBox of width/height
    let aspect = 4;
    const vb = svgText.match(/viewBox=["']([\d.\-\s]+)["']/);
    if (vb) {
      const parts = vb[1].split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) aspect = parts[2] / parts[3];
    }

    // Forceer explicit dimensies zodat browsers de SVG kunnen renderen
    if (!/<svg[^>]*\swidth=/.test(svgText)) {
      const targetW = 1200;
      const targetH = Math.round(targetW / aspect);
      svgText = svgText.replace(/<svg/, `<svg width="${targetW}" height="${targetH}"`);
    }

    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = Math.round(1600 / aspect);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return { data: canvas.toDataURL('image/png'), aspect };
  } catch {
    return null;
  }
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
    // Laad het witte SVG-logo, render naar PNG op canvas voor jsPDF
    const witLogo = await loadWitLogoAsPng();

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const margin = 18;
    const col2 = W - margin;
    let y = 0;

    // ─── Donkere header (kentekenplaat-stijl) ────────────────
    doc.setFillColor(15, 18, 24); // bijna zwart
    doc.rect(0, 0, W, 30, 'F');

    if (witLogo) {
      const targetH = 12;
      const targetW = targetH * witLogo.aspect;
      doc.addImage(witLogo.data, 'PNG', margin, 9, targetW, targetH);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.text('PEPE®', margin, 18);
    }

    // Tag rechts: titel + datum
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(220, 60, 90); // rood accent
    doc.text('CONSIGNATIE · EINDAFREKENING', col2, 14, { align: 'right' });
    const datum = new Date().toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 188, 200);
    doc.text(datum, col2, 21, { align: 'right' });

    // Dunne rode accent-streep onder header
    doc.setFillColor(146, 25, 57);
    doc.rect(0, 30, W, 0.6, 'F');

    y = 30.6;

    // ─── Hero blok ───────────────────────────────────────────
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 25, 57);
    doc.text('EINDAFREKENING VOOR KLANT', margin, y);

    y += 11;
    doc.setFontSize(28);
    doc.setTextColor(15, 18, 24);
    doc.text(form.auto.toUpperCase(), margin, y);

    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(122, 132, 144);
    doc.text(
      cijfers.isIncl ? 'Personenauto · alle bedragen incl. btw/bpm' : 'Bedrijfswagen · alle bedragen excl. btw',
      margin, y
    );

    // Subtiele scheidingslijn onder hero
    y += 9;
    doc.setDrawColor(232, 232, 236);
    doc.setLineWidth(0.3);
    doc.line(margin, y, col2, y);
    y += 8;

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

    // Sectie-label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(146, 25, 57);
    doc.text('SPECIFICATIE', margin, y);
    y += 6;

    regels.forEach((r, i) => {
      const pfx = r.type === 'zero' ? '' : r.type === 'pos' ? '+ ' : '− ';
      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      if (r.type === 'zero') doc.setTextColor(190, 192, 198);
      else doc.setTextColor(75, 82, 92);
      doc.text(r.lbl, margin, y + 5.5);

      // Bedrag (tabular)
      doc.setFont('helvetica', 'bold');
      if (r.type === 'pos') doc.setTextColor(15, 18, 24);
      else if (r.type === 'zero') doc.setTextColor(190, 192, 198);
      else doc.setTextColor(15, 18, 24);
      doc.text(`${pfx}€ ${fmtEuro(r.val)}`, col2, y + 5.5, { align: 'right' });

      // Subtiele lijn
      doc.setDrawColor(238, 238, 240);
      doc.setLineWidth(0.2);
      doc.line(margin, y + 10, col2, y + 10);

      // Iets dikkere lijn tussen verkoopprijs en aftrekposten
      if (i === 0) {
        doc.setDrawColor(15, 18, 24);
        doc.setLineWidth(0.4);
        doc.line(margin, y + 10, col2, y + 10);
      }
      y += 11.5;
    });

    // ─── Totaalbalk: ZWART, premium ──────────────────────────
    y += 8;
    doc.setFillColor(15, 18, 24);
    doc.rect(margin - 4, y, W - 2 * (margin - 4), 24, 'F');
    // Rode accent-streep aan linkerzijde
    doc.setFillColor(146, 25, 57);
    doc.rect(margin - 4, y, 3, 24, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(220, 60, 90);
    doc.text('NETTO OPBRENGST KLANT', margin + 2, y + 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(`€ ${fmtEuro(cijfers.totaal)}`, col2, y + 16, { align: 'right' });
    y += 24;

    // BTW-toelichting
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 148, 158);
    const toelichting = cijfers.isIncl
      ? 'Kosten zijn omgerekend van excl btw naar incl btw (×1,21) zodat alle bedragen in dezelfde basis staan.'
      : 'Bedrijfswagen — alle bedragen zijn excl btw.';
    doc.text(toelichting, margin, y, { maxWidth: W - 2 * margin });

    // ─── Footer ──────────────────────────────────────────────
    y = 283;
    doc.setDrawColor(15, 18, 24);
    doc.setLineWidth(0.3);
    doc.line(margin, y, col2, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 18, 24);
    doc.text('PEPE®  WAGENPARKBEHEER', margin, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 168, 178);
    doc.text('pepewagenparkbeheer.nl', col2, y + 5.5, { align: 'right' });

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
            <button
              key={s.key}
              type="button"
              className={`${styles.stepItem} ${i === stap ? styles.stepActief : ''} ${i < stap ? styles.stepDone : ''}`}
              onClick={() => setStap(i)}
              title={`Stap ${i + 1}: ${s.label}`}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepLabel}>{s.label}</span>
            </button>
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
