/**
 * Extraheert de diepste (originele) email-sectie uit een doorgezonden keten.
 * Zoekt naar Outlook forward-headers ("Van: ...\nVerzonden: ...") en geeft
 * alles na de laatste zo'n header terug — dat is de originele mail.
 * Zonder forward-markers: volledige tekst terug.
 */
export function extractOrigineleSectie(tekst: string): string {
  const delen = tekst.split(/\n(?=(?:Van:|From:)\s+\S[^\n]*\n(?:Verzonden:|Sent:)\s+)/);
  if (delen.length <= 1) return tekst.trim();
  return delen[delen.length - 1].trim();
}

/**
 * Converteert HTML naar leesbare tekst met behoud van tabelstructuur.
 * <td>/<th> → tab-scheider, <tr>/<br>/<p>/<div> → newline, rest gestript.
 * Veilig op plain text: geen tags → tekst ongewijzigd.
 */
export function htmlNaarTekst(html: string): string {
  return html
    // Tabelcellen: tab als scheider zodat "Label\tWaarde" per rij leesbaar blijft
    .replace(/<\/?(td|th)[^>]*>/gi, '\t')
    // Rij-grenzen en blok-elementen naar newline
    .replace(/<\/?(tr|p|div|br|h[1-6]|li|ul|ol|blockquote)[^>]*>/gi, '\n')
    // Resterende tags strippen
    .replace(/<[^>]+>/g, '')
    // Veelgebruikte HTML-entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Meerdere tabs → één tab
    .replace(/\t{2,}/g, '\t')
    // Regels trimmen en lege weggooien
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}
