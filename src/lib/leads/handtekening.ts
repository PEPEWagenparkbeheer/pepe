// Volledige PEPE-huisstijlhandtekening voor lead-antwoorden vanaf info@.
// Persoonsgegevens komen server-side uit medewerkers en worden nooit uit de request overgenomen.

export interface LeadOndertekenaar {
  naam: string;
  volledigeNaam?: string | null;
  mobiel?: string | null;
  fotoUrl?: string | null;
}

const PAARS = '#190c35';
const ROOD = '#a71942';
const WEBSITE = 'https://pepewagenparkbeheer.nl';

export function leadHandtekening(medewerker?: LeadOndertekenaar | null): string {
  const volledigeNaam = medewerker?.volledigeNaam?.trim() || medewerker?.naam?.trim() || 'PEPE Wagenparkbeheer';
  const mobiel = medewerker?.mobiel?.trim() || '';
  const fotoUrl = veiligeUrl(medewerker?.fotoUrl);
  const initialen = volledigeNaam
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((deel) => deel[0]?.toUpperCase())
    .join('') || 'P';
  const mobielHtml = mobiel
    ? `<strong>M:</strong> <a href="tel:${escapeAttr(mobiel.replace(/[^+\d]/g, ''))}" style="color:${PAARS};text-decoration:underline">${escapeHtml(mobiel)}</a> &nbsp;|&nbsp; `
    : '';

  const portret = fotoUrl
    ? `<img src="${escapeAttr(fotoUrl)}" width="68" height="58" alt="${escapeAttr(volledigeNaam)}" style="display:block;width:68px;height:58px;object-fit:cover;border:0;border-radius:6px" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="68" height="58" style="width:68px;height:58px;background:${PAARS};border-radius:6px"><tr><td align="center" valign="middle" style="color:#fff;font:bold 18px Arial,sans-serif">${escapeHtml(initialen)}</td></tr></table>`;

  return `
<div style="font-family:Arial,Helvetica,sans-serif;color:${PAARS};font-size:12px;line-height:1.35;margin-top:20px">
  <div style="font-size:14px;margin-bottom:18px">Met vriendelijke groet / Kind regards / Mit freundlichen Gr&uuml;&szlig;en,</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;color:${PAARS};font-family:Arial,Helvetica,sans-serif">
    <tr>
      <td width="76" valign="top" style="width:76px;padding:0 8px 12px 0">${portret}</td>
      <td valign="top" style="padding:0 0 12px 6px;font-size:12px;line-height:1.45">
        <div style="font-size:14px;font-weight:700;margin-bottom:5px">${escapeHtml(volledigeNaam)} | PEPE Wagenparkbeheer B.V.</div>
        <div>${mobielHtml}<strong>T:</strong> <a href="tel:+31165794100" style="color:${PAARS};text-decoration:underline">+31 (0)165 794 100</a></div>
        <div><a href="${WEBSITE}" style="color:${PAARS};text-decoration:underline">pepewagenparkbeheer.nl</a> | <a href="https://maps.google.com/?q=De+Gorzen+19+4731+TV+Oudenbosch" style="color:${PAARS};text-decoration:underline">De Gorzen 19 | 4731 TV Oudenbosch</a></div>
      </td>
    </tr>
  </table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:520px;max-width:100%;border-collapse:collapse;margin:0 0 14px 0">
    <tr>
      <td bgcolor="${PAARS}" style="background:${PAARS};padding:14px 18px;color:#fff;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:19px;letter-spacing:.2px;border-radius:6px 0 0 6px">
        <span style="color:#fff">PEPE<sup style="font-size:8px">&reg;</sup></span>
        <span style="color:${ROOD};padding:0 12px">/</span>
        <span style="color:#fff">SAMEN VOORUIT.</span>
      </td>
      <td width="108" bgcolor="#ffffff" style="width:108px;padding:4px 0 4px 12px;color:#aaaaaa;font-size:10px;line-height:1.25">
        Volg onze laatste<br />ontwikkelingen<br />
        <a href="https://www.instagram.com/pepewagenparkbeheer/" style="display:inline-block;background:${ROOD};color:#fff;text-decoration:none;font-weight:bold;padding:4px 7px;margin-top:5px;border-radius:3px">IG</a>
        <a href="https://www.linkedin.com/company/pepe-wagenparkbeheer/" style="display:inline-block;background:${ROOD};color:#fff;text-decoration:none;font-weight:bold;padding:4px 6px;margin-top:5px;border-radius:3px">in</a>
      </td>
    </tr>
  </table>

  <div style="max-width:980px;color:#b1b1b1;font-size:9px;line-height:1.35">
    Dit e-mailbericht is uitsluitend bestemd voor de geadresseerde(n). Indien u dit e-mailbericht ten onrechte heeft ontvangen, verzoeken wij u de inhoud niet te gebruiken en/of onder derden te verspreiden, maar het bericht te verwijderen en contact op te nemen met de afzender. Gebruik van deze informatie door anderen dan de geadresseerde(n) is verboden. Openbaarmaking, vermenigvuldiging, verspreiding en/of verstrekking van deze informatie aan derden is niet toegestaan. Op al onze diensten en correspondentie zijn onze <a href="${WEBSITE}" style="color:#999;text-decoration:underline">algemene voorwaarden</a>, <a href="${WEBSITE}" style="color:#999;text-decoration:underline">privacy statement</a> en disclaimer van toepassing.
  </div>
</div>`.trim();
}

function veiligeUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
