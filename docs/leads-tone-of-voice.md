# Tone of voice — antwoorden op leads (PEPE)

Bron: echte antwoorden van Joep op AutoTrack/AutoScout-leads (doorgestuurd "Voor brein", 2026-06).
Gebruikt als stijlreferentie voor de BREIN lead-concepten (Deel 2). Namen/e-mails geanonimiseerd.

## Kenmerken
- **Informeel, je/jij** (geen "u"), kort en vriendelijk, to-the-point.
- **Aanhef:** "Beste [voornaam]," of "Goedemiddag [voornaam],"
- **Bedank + benoem de auto:** "Dank voor je aanvraag." / "Dank voor je reactie op de [auto] die wij te koop aanbieden." / "Dank voor je bericht."
- **Bevestig beschikbaarheid** (kernzin, vereist voorraadcheck via Mobilox): "De [auto] is nog beschikbaar."
- **Afsluiting:** "Zodra wij de foto's hebben gaan we voor je aan de slag." + officiële handtekening.

## Scenario's

**1. Interesse/aanvraag (evt. met inruil-auto)**
> Goedemiddag [voornaam], Dank voor je aanvraag. De [auto] is nog beschikbaar. Om een geschikte
> waardebepaling te doen van je [inruilauto] hebben we een aantal foto's nodig. Welke foto's kun
> je terugvinden in het document uit de bijlage. Zodra wij de foto's hebben gaan we voor je aan de slag.

**2. Inruil-aanvraag** → bevestig dat inruil kan + PDF + extra vragen
> Beste [voornaam], Dank voor je reactie op de [auto] die wij te koop aanbieden. Je kunt je huidige
> [inruilauto] inruilen. Om een geschikte waardebepaling te doen hebben wij iets meer foto's nodig.
> In de bijlage tref je een document waarop staat welke foto's wij precies nodig hebben. Zodra wij
> deze hebben gaan we voor je aan de slag. Verder nog een paar vragen:
> - Is de auto privé of zakelijk (marge of btw)?
> - Wanneer heeft hij zijn laatste onderhoudsbeurt gehad?
> Alvast dank!

**3. Terugbelverzoek** → meld belpoging + beschikbaarheid + open vraag
> Beste [voornaam], Dank voor je bericht. Ik heb je net proberen te bellen maar krijg je niet te
> pakken. De [auto] is nog beschikbaar en ik ben benieuwd hoe we je verder kunnen helpen?

## Vaste elementen voor de BREIN-prompt
- Altijd **beschikbaarheid bevestigen** ("is nog beschikbaar") — afhankelijk van Mobilox-voorraad.
- Bij **inruil of genoemde inruil-auto**: de **waardebepaling-PDF** als bijlage (`...Waardebepaling A4...pdf`) + de twee standaardvragen (privé/zakelijk marge/btw; laatste onderhoudsbeurt).
- Korte, persoonlijke toon; officiële handtekening eronder (zie `src/lib/brein/handtekening.ts`).
