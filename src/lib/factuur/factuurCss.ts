// Exacte CSS uit het PEPE-factuurdesign (claude/design export). Niet handmatig wijzigen.
// 'assets/' wordt bij het renderen vervangen door een absolute URL naar /factuur-assets/.
export const FACTUUR_CSS = `/* vietnamese */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-1.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-2.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 600;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-3.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* vietnamese */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-1.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-2.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 700;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-3.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* vietnamese */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 800;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-1.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 800;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-2.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 800;
  font-stretch: 100%;
  font-display: swap;
  src: url("assets/archivo-3.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/archivo-4.woff2") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/archivo-5.woff2") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* greek */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/archivo-6.woff2") format('woff2');
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}
/* vietnamese */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/archivo-7.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/archivo-8.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("assets/archivo-9.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/archivo-4.woff2") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/archivo-5.woff2") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* greek */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/archivo-6.woff2") format('woff2');
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}
/* vietnamese */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/archivo-7.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/archivo-8.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("assets/archivo-9.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/archivo-4.woff2") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/archivo-5.woff2") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* greek */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/archivo-6.woff2") format('woff2');
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}
/* vietnamese */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/archivo-7.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/archivo-8.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("assets/archivo-9.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/archivo-4.woff2") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/archivo-5.woff2") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* greek */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/archivo-6.woff2") format('woff2');
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}
/* vietnamese */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/archivo-7.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/archivo-8.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("assets/archivo-9.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* cyrillic-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/archivo-4.woff2") format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F;
}
/* cyrillic */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/archivo-5.woff2") format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}
/* greek */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/archivo-6.woff2") format('woff2');
  unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF;
}
/* vietnamese */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/archivo-7.woff2") format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
/* latin-ext */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/archivo-8.woff2") format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("assets/archivo-9.woff2") format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}


  :root{
    --burg:#951730; --burg-deep:#7d1228;
    --ink:#23262b; --muted:#6b6e73; --soft:#8b8e93;
    --line:#e4e4e7; --hair:#cfcfd3; --ph:#b6b7bb;
    --paper:#ffffff; --tint:#faf7f8; --bg:#ececed;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:var(--bg);}
  body{font-family:"Manrope",system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;}

  .page{
    position:relative;width:210mm;min-height:297mm;margin:24px auto;
    background:var(--paper);padding:13mm 14mm 11mm;
    display:flex;flex-direction:column;
    box-shadow:0 6px 30px rgba(0,0,0,.14);
  }

  /* ---------- header ---------- */
  .head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}
  .logo{height:38px;width:auto;display:block;}
  .doc-meta{text-align:right;}
  .from{margin-top:6px;}
  .from .fn{font-family:"Archivo",sans-serif;font-weight:700;font-size:11px;letter-spacing:.02em;color:var(--burg);}
  .from .fa{font-size:9px;line-height:1.5;color:var(--muted);margin-top:2px;}
  .doc-title{font-family:"Archivo",sans-serif;font-weight:800;font-size:16px;letter-spacing:.18em;color:var(--ink);line-height:1;}
  .doc-title-center{text-align:center;font-size:18px;letter-spacing:.32em;margin:6px 0 0;padding-left:.32em;}
  .doc-sub{margin-top:5px;font-size:9px;letter-spacing:.06em;color:var(--muted);}
  .doc-sub b{color:var(--burg);font-weight:700;}
  .rule{height:2px;background:var(--burg);margin:9px 0 16px;}

  /* ---------- top: factuur aan + gegevens ---------- */
  .topgrid{display:grid;grid-template-columns:1.55fr 1fr;gap:22px;margin-bottom:16px;}
  .pcard-h{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--burg);font-weight:800;margin-bottom:9px;}
  .field{margin-bottom:6px;}
  .fl{display:block;font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin-bottom:2px;}
  .fv{display:block;border-bottom:1px solid var(--hair);min-height:15px;font-size:11px;font-weight:600;color:var(--ink);padding-bottom:2px;}
  .fv:empty::before{content:attr(data-ph);color:var(--ph);font-weight:400;}
  .frow{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .pcwp{display:grid;grid-template-columns:0.62fr 1.38fr;gap:8px;}

  /* invoice meta as keyed rows */
  .metacard{border:1px solid var(--line);background:var(--tint);padding:6px 14px;display:flex;flex-direction:column;align-self:start;}
  .mrow{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px dotted var(--line);font-size:10.5px;}
  .mrow:last-child{border-bottom:none;}
  .mrow .mk{color:var(--muted);}
  .mrow .mv{font-weight:700;color:var(--ink);text-align:right;}
  .mrow .mv[contenteditable]:empty::before{content:attr(data-ph);color:var(--ph);font-weight:400;}
  .mrow.hl .mk{color:var(--burg);font-weight:700;}
  .mrow.hl .mv{color:var(--burg);}

  /* ---------- car band (no photo / no plate) ---------- */
  .carband{border:1px solid var(--line);background:var(--tint);padding:12px 14px;margin-bottom:16px;}
  .car-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
  .car-name{font-family:"Archivo",sans-serif;font-weight:800;font-size:24px;line-height:1.02;letter-spacing:-.01em;color:var(--ink);}
  .car-trim{font-size:12px;font-weight:500;color:var(--muted);}
  .chips{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:13px;margin-left:-9px;}
  .chip{display:flex;flex-direction:column;border-left:2px solid var(--burg);padding:1px 0 1px 8px;min-width:0;}
  .chip .cl{font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);}
  .chip .cv{font-size:11px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .chip .cv:empty::before{content:attr(data-ph);color:var(--ph);font-weight:400;}

  /* section heading */
  .sec-h{font-family:"Archivo",sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--ink);margin-bottom:10px;display:flex;align-items:center;gap:9px;text-align:center;}
  .sec-h::before,.sec-h::after{content:"";flex:1;height:1px;background:var(--line);}

  /* ---------- line items table ---------- */
  .items{width:100%;margin:0 0 16px;border-collapse:collapse;}
  .items thead th{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:var(--ink);font-weight:700;padding:7px 10px;text-align:left;vertical-align:bottom;}
  .items thead th.num{text-align:right;}
  .items tbody td{font-size:10.5px;color:var(--ink);padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;}
  .items tbody td.num{text-align:right;font-weight:700;white-space:nowrap;}
  .items tbody td.qty{font-weight:700;color:var(--muted);}
  .items tbody td.btw{text-align:center;color:var(--muted);font-weight:600;}
  .items tbody tr:last-child td{border-bottom:1.5px solid var(--ink);}
  .items .desc{font-weight:600;}
  [contenteditable]:empty::before{content:attr(data-ph);color:var(--ph);font-weight:400;}

  /* ---------- bottom: btw spec + totals ---------- */
  .bottom{display:grid;grid-template-columns:1fr 78mm;gap:20px;align-items:start;margin-bottom:16px;}

  .btwspec{border:1px solid var(--line);}
  .spec-h{background:var(--tint);color:var(--burg);font-size:9px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;padding:6px 11px;border-bottom:1px solid var(--line);}
  .btwtab{width:100%;border-collapse:collapse;}
  .btwtab th{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);font-weight:700;padding:6px 11px;text-align:right;}
  .btwtab th:first-child{text-align:left;}
  .btwtab td{font-size:10px;color:var(--ink);padding:6px 11px;text-align:right;border-top:1px dotted var(--line);font-weight:600;}
  .btwtab td:first-child{text-align:left;color:var(--muted);}

  .totals{border:1px solid var(--line);}
  .tot-h{background:var(--ink);color:#fff;font-size:9px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;padding:6px 11px;}
  .tot-body{padding:8px 11px;}
  .tline{display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;font-size:10.5px;border-bottom:1px dotted var(--line);}
  .tline .tk{color:var(--muted);}
  .tline .tv{font-weight:700;color:var(--ink);white-space:nowrap;}
  .tline.grand{border-bottom:none;border-top:1.5px solid var(--ink);margin-top:3px;padding-top:8px;}
  .tline.grand .tk{font-family:"Archivo",sans-serif;font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink);}
  .tline.grand .tv{font-family:"Archivo",sans-serif;font-weight:800;font-size:18px;color:var(--burg);}

  /* ---------- payment note ---------- */
  .paynote{border-left:3px solid var(--burg);background:var(--tint);padding:11px 14px;margin-bottom:14px;font-size:10.5px;line-height:1.6;color:var(--ink);text-align:center;}
  .paynote b{color:var(--burg);font-weight:700;}
  .paynote .iban{font-family:"Archivo",sans-serif;font-weight:700;letter-spacing:.02em;}

  /* ---------- footer ---------- */
  .vspace{flex:1 1 0;min-height:0;}
  .vspace.top{flex:1 1 0;}
  .vspace.bottom{flex:1.2 1 0;}
  .foot{border-top:1.6px solid var(--burg);padding-top:8px;}
  .foot-row{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 15px;font-size:8px;color:var(--ink);}
  .foot-row span{white-space:nowrap;}
  .foot-row+.foot-row{margin-top:4px;}
  .foot-row .lab{color:var(--burg);font-weight:800;letter-spacing:.04em;margin-right:4px;}

  @media print{
    @page{size:A4;margin:0;}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    html,body{background:#fff;}
    .page{margin:0;box-shadow:none;width:210mm;min-height:297mm;}
  }
`;
