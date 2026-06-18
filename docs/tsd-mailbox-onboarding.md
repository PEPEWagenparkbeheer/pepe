# TSD mailbox-onboarding (BREIN)

**Status:** mail verstuurd aan TSD IT op 2026-06-18 — wachten op (1) bevestiging server-side omleiding en (2) keuze verzendmethode.

## Architectuur (definitief)

Mailflow voor TSD als BREIN-klant:

- **Ontvangen:** `wagenpark@tsd-group.nl` → **server-side omleiding (redirect)** → `tsd@pepewagenparkbeheer.nl`.
  BREIN leest `tsd@pepewagenparkbeheer.nl` (PEPE-tenant, via de bestaande Azure-app met `Mail.Read`/`Mail.Send`/`Mail.ReadWrite`).
  ⚠️ Het moet een **omleiding/redirect** zijn, géén forward — anders gaat het oorspronkelijke afzenderadres (de berijder) verloren en kan BREIN het contact/voertuig niet koppelen.
- **Versturen (default, onkwetsbaar):** vanaf `tsd@pepewagenparkbeheer.nl` met weergavenaam "Wagenpark TSD". Leeft volledig in de PEPE-tenant; TSD kan dit niet breken.
- **Versturen (optioneel, op hun domein):** alléén als TSD het op `@tsd-group.nl` wil — via SPF/DKIM-machtiging óf een SMTP-verzendaccount. Dit is per definitie afhankelijk van TSD en dus killbaar.

### Belangrijke overwegingen
- PEPE heeft nu de **login van `wagenpark@tsd-group.nl`** (zo werkt het handmatig vandaag). Dit is bewust **niet** het fundament voor de automatisering: een wachtwoord-reset, MFA of Microsofts SMTP-AUTH-fasering legt het stil.
- Daarom: server-side omleiding (stabiel, overleeft wachtwoord-resets) + standaard versturen vanaf ons eigen adres. Zo ligt de "uit"-knop bij ons, niet bij TSD.
- Echt versturen vanaf `@tsd-group.nl` vereist altijd TSD-medewerking → afweging tussen "lijkt van hun domein" vs. "niet door TSD te killen".

### Codegevolg
- Default (versturen vanaf `tsd@pepewagenparkbeheer.nl`): mailbox toevoegen aan multi-mailbox sync; geen send-as-code nodig.
- Kiest TSD voor SMTP-verzendaccount: apart verzendpad in BREIN nodig (via TSD's SMTP).

## Verstuurde mail (2026-06-18)

**Onderwerp:** Inrichting mailverwerking `wagenpark@tsd-group.nl`

> Beste [naam / TSD IT],
>
> PEPE Wagenparkbeheer automatiseert de mailafhandeling rond `wagenpark@tsd-group.nl`. Voor de berijders verandert er niets aan het adres dat zij gebruiken. We richten dit als volgt in en hebben hiervoor één instelling van jullie nodig, plus een keuze.
>
> **Nodig — omleiding van inkomende mail**
> Graag een **server-side omleiding (redirect)** van `wagenpark@tsd-group.nl` naar `tsd@pepewagenparkbeheer.nl`. Belangrijk: een **omleiding**, géén gewone doorstuurregel (forward) — bij een omleiding blijft het oorspronkelijke afzenderadres van de berijder behouden, wat ons systeem nodig heeft om de juiste gegevens te koppelen. Een server-side regel (transport rule) heeft onze voorkeur boven een postvak-regel, zodat de inrichting stabiel blijft.
>
> **Keuze — hoe uitgaande mail eruitziet**
> Standaard versturen wij de antwoorden vanaf `tsd@pepewagenparkbeheer.nl` met weergavenaam "Wagenpark TSD". Dit werkt direct en vraagt niets van jullie kant.
>
> Willen jullie liever dat uitgaande mail vanaf jullie eigen `wagenpark@tsd-group.nl`-adres komt, dan kan dat ook — laat dan weten welke methode jullie voorkeur heeft:
> - **SPF/DKIM-machtiging** voor onze verzendinfrastructuur, of
> - **een verzendaccount (SMTP)** voor `wagenpark@tsd-group.nl`.
>
> Geven jullie de omleiding door zodra die staat, en (optioneel) jullie keuze voor de verzendkant? Dan handelen wij de rest af.
>
> Met vriendelijke groet,
> [jouw naam] — PEPE Wagenparkbeheer
