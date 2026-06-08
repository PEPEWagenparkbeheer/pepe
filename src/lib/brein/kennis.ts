// src/lib/brein/kennis.ts
// PEPE Wagenparkbeheer — beslislogica/procedures voor het beantwoorden van
// berijdersmails. Afkomstig uit het technisch plan (§5 beslislogica, §7 tankpas,
// §8 banden, §9 einde contract). Dit stuurt WAT er geantwoord moet worden;
// de tone-of-voice (HOE) komt uit de verzonden mails.
//
// Houd dit accuraat — dit bepaalt of BREIN het juiste proces volgt.

export const PEPE_PROCEDURES = `
== TANKPAS ==
- Pincode 3x verkeerd ingevoerd / pas GEBLOKKEERD: de pas wordt AUTOMATISCH na 24 uur weer gedeblokkeerd. Antwoord: laat de berijder simpelweg 24 uur wachten en het daarna opnieuw proberen. NOOIT een nieuwe pas bestellen in dit geval.
- Pas VERLOREN of GESTOLEN: een nieuwe pas aanvragen; deze wordt naar het HUISADRES van de berijder gestuurd.
- Pas werkt niet, oorzaak ONBEKEND: leg beide scenario's in één mail uit — (1) als de pincode 3x fout is ingevoerd: 24 uur wachten, dan automatisch gedeblokkeerd; (2) als de pas verloren/gestolen is: dan vragen we een nieuwe aan (naar huisadres).
- Pincode VERGETEN: als de pincode bekend is (HubSpot-veld brandstofpas_pincode gevuld), stuur de pincode terug. Is die niet bekend, verwijs dan naar de leasemaatschappij/pasleverancier.
- Pasleverancier per klant: Fues = Travelcard, TSD Group = Move Move, Babilou = Move Move (eigen) + leasemaatschappij (lease-auto's).

== ONDERHOUD ==
- Onderhoud LEASE-auto: informeer de berijder en wijs de dichtstbijzijnde merkdealer aan op basis van de woonplaats.
- Onderhoud EIGENDOM (eigen wagenpark): de offerte loopt via WBP (Wagenparkbeheer) ter akkoord vóór uitvoering.

== BANDEN ==
- Bandenprofiel "4-seizoenen" of "Zomerbanden": GEEN seizoenswissel; alleen vervangen bij slijtage.
- Bandenprofiel "Winter- & zomerbanden": wel seizoenswissel — winterbanden vóór oktober, zomerbanden vóór april.

== VOERTUIG / RDW ==
- Fiscale waarde / bijtelling: zoek via RDW de fiscale waarde + brandstofsoort op en reken de bijtelling uit.
- APK: zoek via RDW de APK-datum op en adviseer wanneer actie nodig is.

== SCHADE ==
- Schade melden: stuur het schadeformulier mee + de instructie van de betreffende leasemaatschappij.
- Ruitschade: instructie van de betreffende leasemaatschappij + hun voorkeursleverancier. Stuur altijd de directe webpagina of het telefoonnummer mee (geen app-verwijzingen).

== DOCUMENTEN / CONTRACT ==
- Kentekenbewijs of groene kaart opvragen: bij LEASE → verwijs naar de leasemaatschappij; bij EIGENDOM → actie voor de PEPE-medewerker.
- Leasecontract opvragen: direct versturen vanuit HubSpot/SharePoint.

== ADRESWIJZIGING ==
- Werk het adres bij in HubSpot én stuur de wijziging door naar de leasemaatschappij.

== SHORTLEASE / LEASE-AANVRAAG / ONBEKEND ==
- Complexe aanvragen (shortlease, lease-calculatie) of onduidelijke gevallen: niet zelf afhandelen. Geef een net antwoord dat je het oppakt en markeer met [ACTIE MEDEWERKER] zodat een collega het overneemt.

ALGEMEEN: volg bovenstaande procedures EXACT. Verzin nooit een eigen procedure of toezegging. Past de situatie bij geen enkele regel, geef dan een net, voorzichtig antwoord en markeer met [ACTIE MEDEWERKER].
`.trim();
