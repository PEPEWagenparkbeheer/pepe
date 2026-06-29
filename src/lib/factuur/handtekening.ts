// Generieke PEPE-mailhandtekening (gebaseerd op Perke's handtekening, zonder persoonlijke naam/mobiel;
// afzender = info@pepewagenparkbeheer.nl). HTML-fragment om onder de mailtekst te plakken.

export const PEPE_HANDTEKENING = `
<p style="font-size:11pt;margin:0 0 14pt 0;color:#18122B;">Met vriendelijke groet / Kind regards / Mit freundlichen Grüβen,</p>
<table border="0" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td valign="middle">
      <p style="font-weight:bold;font-size:11pt;margin:0 0 5px 0;color:#18122B;">PEPE Wagenparkbeheer B.V.</p>
      <p style="margin:0;color:#18122B;font-size:11pt;line-height:16pt;">
        <a href="tel:0165794100" style="color:#18122B;text-decoration:none;"><b>T:</b> +31 (0)165 794 100</a> |
        <a href="mailto:info@pepewagenparkbeheer.nl" style="color:#18122B;text-decoration:none;"><b>E:</b> info@pepewagenparkbeheer.nl</a>
        <br>
        <a href="https://pepewagenparkbeheer.nl/" style="color:#18122B;text-decoration:none;">pepewagenparkbeheer.nl</a> |
        <a href="https://maps.app.goo.gl/5TQvGepzUUBXySMV9" style="color:#18122B;text-decoration:none;">De Gorzen 19 | 4731 TV Oudenbosch</a>
      </p>
    </td>
  </tr>
</table>
<table border="0" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td colspan="2" height="15" style="font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr>
    <td valign="top" style="padding-right:12px;">
      <a href="https://pepewagenparkbeheer.nl/" style="color:#18122B;text-decoration:none;">
        <img src="https://pepewagenparkbeheer.nl/app/uploads/2025/10/Banner.png" width="390" height="65" alt="PEPE Wagenparkbeheer" style="display:block;border:0;width:100%;max-width:390px;height:auto;background-color:#18122B;border-radius:8px;">
      </a>
    </td>
    <td valign="top" style="vertical-align:top;">
      <p style="margin:0 0 3pt 0;color:#bbbbbb;font-size:9pt;">Volg onze laatste<br>ontwikkelingen</p>
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td valign="middle"><a href="https://www.instagram.com/pepewagenparkbeheer/" style="display:inline-block;text-decoration:none;"><img src="https://pepewagenparkbeheer.nl/app/uploads/2025/10/Instagram.png" width="25" height="25" alt="Instagram" style="display:block;border:0;"></a></td>
        <td width="6" style="font-size:0;line-height:0;">&nbsp;</td>
        <td valign="middle"><a href="https://www.linkedin.com/company/pepe-wagenparkbeheer/" style="display:inline-block;text-decoration:none;"><img src="https://pepewagenparkbeheer.nl/app/uploads/2025/10/Linkedin2.png" width="25" height="25" alt="LinkedIn" style="display:block;border:0;"></a></td>
      </tr></table>
    </td>
  </tr>
  <tr><td colspan="2" height="15" style="font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
<p style="font-size:8pt;color:#bbbbbb;line-height:11pt;margin:0;max-width:1100px;">
  Dit emailbericht is uitsluitend bestemd voor de geadresseerde(n). Indien u dit emailbericht ten onrechte heeft ontvangen, verzoeken wij u de inhoud niet te gebruiken en/of onder derden te verspreiden, maar het bericht te verwijderen en contact op te nemen met de afzender. Op al onze diensten en correspondentie zijn onze <a href="https://pepewagenparkbeheer.nl/algemene-voorwaarden/" style="color:#bbbbbb;text-decoration:underline;">algemene voorwaarden</a>, <a href="https://pepewagenparkbeheer.nl/privacy-statement/" style="color:#bbbbbb;text-decoration:underline;">privacy statement</a> en <a href="https://pepewagenparkbeheer.nl/disclaimer/" style="color:#bbbbbb;text-decoration:underline;">disclaimer</a> van toepassing.
</p>`;

/** Vriendelijke, type-specifieke begeleidende mailtekst + handtekening. */
export function factuurMailHtml(opts: {
  type: string; nummer: string; tav?: string | null; kenteken?: string | null;
  merk?: string | null; model?: string | null; periode?: string | null;
}): string {
  const aanhef = opts.tav ? `Beste ${opts.tav},` : 'Beste relatie,';
  let intro: string;
  switch (opts.type) {
    case 'auto':
      intro = `Hierbij ontvangt u de factuur voor de levering van ${[opts.merk, opts.model].filter(Boolean).join(' ')}${opts.kenteken ? ` (${opts.kenteken})` : ''}.`;
      break;
    case 'shortlease':
      intro = `Hierbij ontvangt u de factuur voor de shortlease${opts.periode ? ` over de periode ${opts.periode}` : ''}.`;
      break;
    case 'wagenparkbeheer':
      intro = `Hierbij ontvangt u de factuur voor het wagenparkbeheer${opts.periode ? ` over de periode ${opts.periode}` : ''}.`;
      break;
    default:
      intro = 'Hierbij ontvangt u bijgevoegde factuur.';
  }
  return `
  <div style="font-family:Arial,sans-serif;font-size:11pt;color:#18122B;padding-left:20px;">
    <p style="margin:0 0 12pt 0;">${aanhef}</p>
    <p style="margin:0 0 12pt 0;">${intro} U vindt de factuur in de bijlage (PDF).</p>
    <p style="margin:0 0 18pt 0;">Heeft u vragen? Neem gerust contact met ons op.</p>
    ${PEPE_HANDTEKENING}
  </div>`;
}
