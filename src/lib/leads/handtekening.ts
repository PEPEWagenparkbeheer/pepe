// Handtekening voor uitgaande lead-antwoorden namens PEPE Wagenparkbeheer (vanaf info@).
// Bewust los van de FUES-handtekening (src/lib/brein/handtekening.ts) — andere afzender/huisstijl.
// De groet is drietalig zodat hij ook bij Engelse/Duitse antwoorden past.

/** HTML-handtekening met de naam van de behandelende medewerker (of generiek). */
export function leadHandtekening(wie?: string | null): string {
  const naam = (wie ?? '').trim() || 'PEPE Wagenparkbeheer';
  return `
<div style="font-family:Calibri,Arial,sans-serif;color:#401837;font-size:11pt;line-height:1.5;margin-top:18px">
  Met vriendelijke groet / Kind regards / Mit freundlichen Grüßen,<br><br>
  <strong style="text-transform:uppercase">${escapeHtml(naam)}</strong><br>
  PEPE Wagenparkbeheer B.V.<br>
  T +31 (0)165 794 100<br>
  E <a href="mailto:info@pepewagenparkbeheer.nl" style="color:#401837">info@pepewagenparkbeheer.nl</a><br>
  W <a href="https://pepewagenparkbeheer.nl" style="color:#401837">pepewagenparkbeheer.nl</a><br>
  A De Gorzen 19, 4731 TV, Oudenbosch
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
