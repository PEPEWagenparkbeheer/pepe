// Volledige PEPE-huisstijlhandtekening voor lead-antwoorden vanaf info@.
// Persoonsgegevens komen server-side uit medewerkers en worden nooit uit de request overgenomen.

export interface LeadOndertekenaar {
  naam: string;
  volledigeNaam?: string | null;
  mobiel?: string | null;
  fotoUrl?: string | null;
}

const PAARS = '#190c35';
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
    ? `<img src="${escapeAttr(fotoUrl)}" width="68" height="62" alt="Profielfoto ${escapeAttr(volledigeNaam)}" style="display:block;width:68px;height:62px;object-fit:cover;border:0;outline:0;background-color:${PAARS};border-radius:8px" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="68" height="62" style="width:68px;height:62px;background:${PAARS};border-radius:8px"><tr><td align="center" valign="middle" style="color:#fff;font:bold 18px Arial,sans-serif">${escapeHtml(initialen)}</td></tr></table>`;

  return `
<div style="font-family:Arial,sans-serif;color:${PAARS};font-size:11pt;line-height:1.35;margin-top:20px">
  <p style="font-size:11pt;margin:0 0 14pt 0;color:${PAARS}">Met vriendelijke groet / Kind regards / Mit freundlichen Gr&uuml;&szlig;en,</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;color:${PAARS};font-family:Arial,Helvetica,sans-serif">
    <tr>
      <td width="79" valign="top" style="width:79px;padding:0 11pt 0 0">${portret}</td>
      <td valign="middle" style="font-size:11pt;line-height:16pt">
        <div style="font-size:11pt;font-weight:700;margin-bottom:5px">${escapeHtml(volledigeNaam)} | PEPE Wagenparkbeheer B.V.</div>
        <div>${mobielHtml}<strong>T:</strong> <a href="tel:+31165794100" style="color:${PAARS};text-decoration:underline">+31 (0)165 794 100</a></div>
        <div><a href="${WEBSITE}" style="color:${PAARS};text-decoration:none">pepewagenparkbeheer.nl</a> | <a href="https://maps.app.goo.gl/5TQvGepzUUBXySMV9" style="color:${PAARS};text-decoration:none">De Gorzen 19 | 4731 TV Oudenbosch</a></div>
      </td>
    </tr>
  </table>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
    <tr><td colspan="2" height="15" style="font-size:0;line-height:0">&nbsp;</td></tr>
    <tr>
      <td valign="top" style="padding-right:12px">
        <a href="${WEBSITE}" style="color:${PAARS};text-decoration:none">
          <img src="https://pepewagenparkbeheer.nl/app/uploads/2025/10/Banner.png" width="390" height="65" alt="PEPE Wagenparkbeheer" style="display:block;border:0;width:390px;max-width:100%;height:auto;background-color:${PAARS};border-radius:8px" />
        </a>
      </td>
      <td valign="top">
        <p style="margin:0 0 3pt 0;color:#bbbbbb;font-size:9pt">Volg onze laatste<br />ontwikkelingen</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><a href="https://www.instagram.com/pepewagenparkbeheer/"><img src="https://pepewagenparkbeheer.nl/app/uploads/2025/10/Instagram.png" width="25" height="25" alt="Instagram" style="display:block;border:0;outline:0" /></a></td>
          <td width="6" style="font-size:0;line-height:0">&nbsp;</td>
          <td><a href="https://www.linkedin.com/company/pepe-wagenparkbeheer/"><img src="https://pepewagenparkbeheer.nl/app/uploads/2025/10/Linkedin2.png" width="25" height="25" alt="LinkedIn" style="display:block;border:0;outline:0" /></a></td>
        </tr></table>
      </td>
    </tr>
    <tr><td colspan="2" height="15" style="font-size:0;line-height:0">&nbsp;</td></tr>
  </table>

  <p style="font-size:8pt;color:#bbbbbb;line-height:11pt;margin:0;max-width:1100px">
    Dit emailbericht is uitsluitend bestemd voor de geadresseerde(n). Indien u dit emailbericht ten onrechte heeft ontvangen, verzoeken wij u de inhoud niet te gebruiken en/of onder derden te verspreiden, maar het bericht te verwijderen en contact op te nemen met de afzender. Gebruik van deze informatie door anderen dan de geadresseerde(n) is verboden. Openbaarmaking, vermenigvuldiging, verspreiding en/of verstrekking van deze informatie aan derden is niet toegestaan. Op al onze diensten en correspondentie zijn onze <a href="${WEBSITE}/algemene-voorwaarden/" style="color:#bbbbbb;text-decoration:underline">algemene voorwaarden</a>, <a href="${WEBSITE}/privacy-statement/" style="color:#bbbbbb;text-decoration:underline">privacy statement</a> en <a href="${WEBSITE}/disclaimer/" style="color:#bbbbbb;text-decoration:underline">disclaimer</a> van toepassing. Deze zijn tevens te downloaden via <a href="${WEBSITE}" style="color:#bbbbbb;text-decoration:underline">www.pepewagenparkbeheer.nl</a>.
  </p>
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
