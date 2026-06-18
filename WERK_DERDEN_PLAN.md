# Plan: Werk Derden feature — flow.pepewagenparkbeheer.nl

## Context
PEPE vergeet soms door derden uitgevoerde werkzaamheden door te factureren aan klanten. Partners
(bijv. Kurdo, Jora) moeten zelf werkzaamheden + bedragen kunnen opgeven per kenteken of meldcode.
PEPE krijgt een overzicht om te controleren wat er nog gefactureerd moet worden. Einddoel: koppeling
met Twinfield voor automatisch facturen genereren.

---

## Stap 1 — Supabase migratie

Nieuw bestand: `supabase/migrations/20260615000001_werk_derden.sql`

```sql
CREATE TABLE werk_derden (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  partner      TEXT NOT NULL,          -- wie-naam van partner (bijv. 'KURDO')
  kenteken     TEXT,
  meldcode     TEXT,
  klant        TEXT,
  regels       JSONB NOT NULL DEFAULT '[]', -- [{omschrijving: str, bedrag: number}]
  status       TEXT NOT NULL DEFAULT 'open', -- 'open' | 'gefactureerd'
  notitie      TEXT,                   -- interne PEPE-notitie
  toegevoegd_door TEXT NOT NULL DEFAULT 'partner', -- 'partner' | 'pepe'
  gefactureerd_op TIMESTAMPTZ,
  hubspot_deal_id TEXT                 -- voor Twinfield-koppeling later
);

ALTER TABLE werk_derden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read" ON werk_derden FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth write" ON werk_derden FOR ALL USING (auth.uid() IS NOT NULL);
```

Constraint: validatie (kenteken OR meldcode verplicht) zit in de UI, niet als DB constraint.

---

## Stap 2 — Types

In `src/types/index.ts` toevoegen:

```typescript
export interface WerkRegel {
  omschrijving: string;
  bedrag: number;
}

export interface WerkDerdenRecord {
  id: string;
  created_at?: string;
  partner: string;
  kenteken?: string;
  meldcode?: string;
  klant?: string;
  regels: WerkRegel[];
  status: 'open' | 'gefactureerd';
  notitie?: string;
  toegevoegd_door: 'partner' | 'pepe';
  gefactureerd_op?: string;
  hubspot_deal_id?: string;
}
```

---

## Stap 3 — Hook

Nieuw bestand: `src/hooks/useWerkDerden.ts`

- `useWerkDerden(wie: string, rol: 'partner' | 'pepe')`:
  - laadt alle records uit Supabase `werk_derden`
  - als `rol === 'partner'`: filter op `partner === wie`
  - als `rol === 'pepe'`: alle records
  - real-time channel (zelfde patroon als `useAfterSales`)
  - `addRecord(rec)` — insert
  - `updateRecord(rec)` — upsert
  - `setGefactureerd(id)` — zet status + timestamp

---

## Stap 4 — Partner-kant

### 4a. Modal: `src/components/partner/WerkDerdenModal.tsx`

Formulier-modal met:
- **Kenteken** of **Meldcode** (één van beide verplicht — validatie in submit handler)
- **Klant** (vrij tekstveld, optioneel)
- **Werkzaamheden-regels**: lijst van `{omschrijving, bedrag}` rijen
  - "+ Regel toevoegen" knop
  - × knop per rij om te verwijderen
  - Bedrag = number input met € prefix
- Onderaan: totaalregel (som van regels)
- "Opslaan" button — submit → `addRecord()` → sluit modal
- CSS module: `WerkDerdenModal.module.css` — stijl volgt PartnerModal patroon

### 4b. Lijst + knop: `src/components/partner/WerkDerdenPartner.tsx`

Sectie onderaan `PartnerPage.tsx` (na de auto-lijst):
- Koptekst "Opgegeven werkzaamheden"
- Knop "+ Werkzaamheden opgeven" → opent `WerkDerdenModal`
- Lijst van eigen ingediende records: datum, kenteken/meldcode, klant, totaalbedrag, status-badge
- Status badge: oranje = open, groen = gefactureerd

### 4c. Integratie in `PartnerPage.tsx`

Onderaan de bestaande pagina `<WerkDerdenPartner wie={wie} />` toevoegen.
`useWerkDerden(wie, 'partner')` aanroepen in `WerkDerdenPartner`.

---

## Stap 5 — PEPE-kant

### 5a. Pagina: `src/app/werk-derden/page.tsx`

Nieuwe route, volledig overzicht voor PEPE-gebruikers.

### 5b. Component: `src/components/werkderden/WerkDerdenOverzicht.tsx`

- Filterbalk: partner-filter (alle partners), status-filter (open / gefactureerd), zoek op kenteken/klant
- Tabel per record:
  - Datum, Partner, Kenteken, Meldcode, Klant, Werkzaamheden (collapsed/expanded), Totaal (€), Status
- Acties per rij:
  - "Markeer gefactureerd" knop (zet status → gefactureerd + timestamp)
  - Potlood-icon: PEPE kan notitie toevoegen
- PEPE kan ook zelf record toevoegen via dezelfde `WerkDerdenModal` (maar dan `toegevoegd_door = 'pepe'`)
- KPI-strip boven de tabel: totaal open bedrag, aantal open, gefactureerd bedrag dit jaar
- **Excel export knop**: exporteert alle zichtbare (gefilterde) records naar .xlsx via `xlsx` library
  - Kolommen: Datum, Partner, Kenteken, Meldcode, Klant, Omschrijving regels (gecombineerd), Totaal (€), Status
  - Bestandsnaam: `werk-derden-export-YYYY-MM-DD.xlsx`
- **HubSpot+RDW knop** per record (zelfde patroon als bij inkoopfacturen):
  - Zoekt kenteken op in HubSpot (deal = voertuig) → haalt klant, entiteit, dealId op
  - Haalt RDW-gegevens op (merk/model ter verificatie)
  - Vult klant-veld bij op het record (of toont een bevestigingsdialoog)
  - Slaat HubSpot `dealId` op in het record (`hubspot_deal_id`) voor latere Twinfield-facturatie
  - Twinfield-koppeling: buiten scope voor nu — dealId is de brug

### 5c. Sidebar

In `src/components/layout/AppLayout.tsx` (sidebar nav) een link "Werk derden" toevoegen.
Gebruik bestaande nav-item patroon. Alleen zichtbaar voor PEPE-gebruikers (niet voor partners).

---

## Volgorde implementatie

1. Migratie schrijven + uitvoeren (SQL uitvoeren in Supabase dashboard)
2. Types toevoegen in `src/types/index.ts`
3. Hook schrijven: `src/hooks/useWerkDerden.ts`
4. `WerkDerdenModal.tsx` (gedeeld door partner én PEPE)
5. `WerkDerdenPartner.tsx` + integratie in `PartnerPage.tsx`
6. `WerkDerdenOverzicht.tsx` + `werk-derden/page.tsx`
7. Sidebar-link toevoegen in `AppLayout.tsx`

---

## Verificatie

- Partner logt in → ziet sectie "Opgegeven werkzaamheden" onderaan → kan modal openen → invullen (minstens kenteken of meldcode) → opslaan → record verschijnt in eigen lijst
- PEPE logt in → `/werk-derden` → ziet alle records van alle partners → kan status omzetten → kan zelf record toevoegen
- Partner ziet GEEN records van andere partners (RLS + client-side filter)
- Bij leeg kenteken én leeg meldcode: form geeft foutmelding, geen submit
- Excel export downloadt correct gefilterde set
- HubSpot+RDW knop vult `hubspot_deal_id` en `klant` correct bij
