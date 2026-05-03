'use client';

interface Props {
  kenteken: string;
}

export default function KentekenPlaat({ kenteken }: Props) {
  const clean = kenteken.replace(/-/g, '').toUpperCase();
  const isMeldcode = /^\d+$/.test(clean) || clean.length < 5;

  if (isMeldcode) {
    return (
      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--muted)', letterSpacing: '0.05em' }}>
        {kenteken}
      </span>
    );
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'stretch',
      border: '1.5px solid #c8a800',
      borderRadius: 4,
      overflow: 'hidden',
      fontFamily: 'Arial, sans-serif',
      fontWeight: 900,
      fontSize: 12,
      lineHeight: 1,
      flexShrink: 0,
    }}>
      <span style={{
        background: '#003399',
        color: '#fff',
        padding: '3px 4px',
        fontSize: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        minWidth: 16,
      }}>
        <span style={{ fontSize: 7 }}>★</span>
        <span>NL</span>
      </span>
      <span style={{
        background: '#f5c800',
        color: '#000',
        padding: '3px 7px',
        letterSpacing: '0.04em',
        display: 'flex',
        alignItems: 'center',
      }}>
        {kenteken.toUpperCase()}
      </span>
    </span>
  );
}
