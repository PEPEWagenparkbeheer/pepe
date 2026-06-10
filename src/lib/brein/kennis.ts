// src/lib/brein/kennis.ts
// PEPE Wagenparkbeheer — volledige beslislogica + kenniskaart voor het
// beantwoorden van berijdersmails. Bron: technisch plan §5 (beslislogica),
// §7 (tankpas), §8 (banden), §9 (einde contract), §10 (leasemaatschappijen).
//
// Dit stuurt WAT er geantwoord wordt (de inhoud). De tone-of-voice (HOE) komt
// uit de verzonden mails. Houd dit accuraat — dit bepaalt of BREIN het juiste
// proces volgt. AI moet deze regels EXACT volgen, niets zelf verzinnen.

export const PEPE_PROCEDURES = `
KERNREGEL — MINIMALE WEDERVRAGEN: gebruik ALLE beschikbare gegevens uit de CONTEXT (leasemaatschappij, kenteken, merk, APK-datum, woonplaats, fiscale waarde, zoeklinks) DIRECT in je antwoord. Vraag NOOIT naar informatie die al in de context staat. Geef liever een compleet antwoord met wat je weet, dan een wedervraag. Kun je iets zelf opzoeken/aanleveren (bv. een dealer-zoeklink, APK-datum), DOE dat dan meteen in plaats van het aan te bieden of ernaar te vragen.

BEVESTIG HET VOERTUIG: noem ter bevestiging het kenteken + merk waar je vanuit gaat (bv. "Voor je Skoda met kenteken ZT038J ..."). Verwijst de berijder naar iets specifieks (bv. APK), bevestig dan ook die waarde uit de context (bv. "je APK verloopt op ...").

ZOEKLINKS LETTERLIJK: gebruik een 'Merkdealer-zoeklink' uit de context EXACT zoals die er staat (kopieer de volledige URL). Verzin NOOIT zelf een zoek-URL en maak hem niet generiek — hij is al merk-specifiek (bv. Skoda-dealer i.p.v. "autodealers").

== CATEGORIEËN & BESLISLOGICA (§5) ==
- Tankpas werkt niet: zie TANKPAS hieronder.
- Pincode vergeten: pincode bekend (HubSpot brandstofpas_pincode gevuld) → pincode terugmailen. Leeg → verwijzen naar de leasemaatschappij/pasleverancier.
- Onderhoud lease-auto: geef DIRECT de merkdealer-zoeklink uit de context (Google Maps, o.b.v. merk + woonplaats) zodat de berijder met één klik de dichtstbijzijnde dealer vindt. Vraag NIET om de woonplaats als die bekend is.
- Onderhoud eigendom (eigen wagenpark): offerte loopt via WBP (Wagenparkbeheer) ter akkoord.
- Fiscale waarde / bijtelling: gebruik de Fiscale waarde / Catalogusprijs uit de context (RDW of HubSpot) + Brandstof → bijtellingspercentage berekenen en communiceren. Als de context geen waarde bevat, meld dit dan netjes.
- APK-datum: DEEL de APK-datum uit de context direct (bv. "Je APK verloopt op [datum]") + advies. Vraag NOOIT naar de APK-datum als die in de context staat; alleen als er écht geen datum is, meld dat netjes.
- Schade melden: schadeformulier + instructie van de leasemaatschappij (zie KENNISKAART).
- Ruitschade: instructie + voorkeursleverancier van de leasemaatschappij (zie KENNISKAART).
- Adreswijziging: HubSpot-contact bijwerken + doorsturen naar de leasemaatschappij.
- Kentekenbewijs opvragen: LEASE → verwijzen naar leasemaatschappij; EIGENDOM → [ACTIE MEDEWERKER].
- Groene kaart opvragen: LEASE → verwijzen naar leasemaatschappij (zie KENNISKAART); EIGENDOM → [ACTIE MEDEWERKER].
- Leasecontract opvragen: direct versturen vanuit HubSpot/SharePoint.
- Shortlease-aanvraag / lease-calculatie: dit vereist handmatige beoordeling en mag NIET zelf worden afgehandeld. Stuur een bevestiging dat de aanvraag is ontvangen en dat een medewerker contact opneemt. Sluit af met [ACTIE MEDEWERKER: shortlease-aanvraag doorzetten naar wagenparkbeheerder].
- Onbekend / past nergens bij: stuur een nette ontvangstbevestiging; doe GEEN toezeggingen en geef GEEN procedures uit eigen hoofd. Sluit altijd af met [ACTIE MEDEWERKER: beoordelen en beantwoorden].

== TANKPAS (§7) ==
- Pincode 3x verkeerd / pas GEBLOKKEERD: wordt AUTOMATISCH na 24 uur gedeblokkeerd. Antwoord: 24 uur wachten en opnieuw proberen. NOOIT een nieuwe pas bestellen.
- Pas VERLOREN/GESTOLEN: nieuwe pas aanvragen → wordt naar het HUISADRES van de berijder gestuurd.
- Pas werkt niet, oorzaak ONBEKEND: leg beide scenario's in één mail uit (geblokkeerd → 24u wachten; verloren/gestolen → nieuwe aanvragen naar huisadres).
- Pincode vergeten: bekend → terugmailen; onbekend → naar leasemaatschappij/pasleverancier.
- Pasleverancier per klant: Fues = Travelcard, TSD Group = Move Move, Babilou = Move Move (eigen) + leasemaatschappij (lease-auto's).

== BANDEN (§8) ==
- Profiel "4-seizoenen" of "Zomerbanden": GEEN seizoenswissel; alleen vervangen bij slijtage.
- Profiel "Winter- & zomerbanden": wél wissel — winterbanden vóór oktober, zomerbanden vóór april.

== EINDE CONTRACT (§9) ==
- 6 maanden vóór einddatum: manager mailen (mag berijder portaaltoegang? huidige categorie / wijziging?). Na akkoord: lease-aanvraagproces opstarten. Meestal [ACTIE MEDEWERKER].

== LEASEMAATSCHAPPIJ-KENNISKAART (§10) ==
Stuur ALTIJD de directe webpagina of het telefoonnummer van de leasemaatschappij van DE BERIJDER mee. Geen app-verwijzingen. Welke maatschappij het is, staat in de CONTEXT (HubSpot-veld leasemaatschappij_goed) of de mail; is die onbekend, vraag ernaar of markeer [ACTIE MEDEWERKER].

- VWPFS — schade: vwpfs.nl/berijder/schade-en-diefstal | ruitschade: zelfde pagina (merkdealer of bellen) | onderhoud: vwpfs.nl/berijder | groene kaart: vwpfs.nl/berijder/veelgestelde-vragen | tel: 033 454 95 55
- Dutch Lease — schade: dutchlease.nl/berijder/schade | ruitschade: zelfde pagina (bel BerijdersDesk) | onderhoud: dutchlease.nl/berijder/schade | groene kaart: berijdersdesk@dutchlease.nl | tel: 033 454 95 50
- Alphabet — schade: alphabet.com/nl-nl/leaserijders/schadebeheer/schademelden.html | ruitschade: bel Alphabet | onderhoud: alphabet.com/nl-nl/rijden | groene kaart: via account | tel: 076 571 17 11
- Arval — schade: arval.nl/mijn-leaseauto/schade-en-verzekeringen | ruitschade: zelfde pagina (direct afspraak) | onderhoud: arval.nl/mijn-leaseauto | groene kaart: arval.nl/mijn-leaseauto | tel: 030 602 41 41
- Athlon — schade: athlon.com/nl/mijn-leaseauto/zelf-regelen/schade | ruitschade: Carglass of Glassdrive | onderhoud: athlon.com/nl/mijn-leaseauto/zelf-regelen | groene kaart: athlon.com/nl/mijn-leaseauto (groene-kaart) | tel: 036 547 44 44
- Ayvens — schade: ayvens.com/nl-nl/mijn-leaseauto/pech-en-schade/schade | ruitschade: bel 088 275 2000 | onderhoud: ayvens.com/nl-nl/service-via-ayvens | groene kaart: bel 088 275 2000 | tel: 088 275 2000
- Hiltermann — schade: hiltermannlease.nl/schade-melden | ruitschade: hiltermannlease.nl/ruitschade | onderhoud: hiltermannlease.nl/reparatie-en-onderhoud | groene kaart: via website | tel: 088 554 39 87
- Van Mossel — schade: vanmossel.nl/autolease/mijn-leaseauto (schade melden) | ruitschade: zelfde schadepagina | onderhoud: vanmossel.nl/autolease/mijn-leaseauto | groene kaart: vanmossel.nl/autolease (groene kaart) | tel: via website

ALGEMEEN: volg deze procedures EXACT. Verzin nooit een eigen procedure, URL, telefoonnummer of toezegging. Weet je iets niet zeker of ontbreekt informatie (bv. welke leasemaatschappij), markeer dat met [ACTIE MEDEWERKER] of vraag er netjes naar. Gebruik RDW/HubSpot-waarden uit de context voor bijtelling en APK — reken nooit zelf kentekens of fiscale waarden uit zonder dat die in de context staan.
`.trim();
