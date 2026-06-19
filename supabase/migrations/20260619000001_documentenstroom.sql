-- Documentenstroom: generieke document-inbox met meerdere documenttypes.
-- Voegt documenttype-discriminator en extra contractkolommen toe aan de
-- bestaande facturen-tabel.

alter table facturen
  add column if not exists documenttype text not null default 'factuur';

do $$ begin
  alter table facturen add constraint facturen_documenttype_chk
    check (documenttype in ('factuur','bestelbevestiging','inzetbevestiging','autokosten'));
exception when duplicate_object then null; end $$;

alter table facturen add column if not exists contractnummer    text;
alter table facturen add column if not exists looptijd_maanden  integer;
alter table facturen add column if not exists jaarkilometrage   integer;
alter table facturen add column if not exists merk_model        text;
alter table facturen add column if not exists banden            text;
alter table facturen add column if not exists inzetdatum        date;
alter table facturen add column if not exists type_aanschaf     text;
alter table facturen add column if not exists brandstof         text;
alter table facturen add column if not exists leasemaatschappij text;

-- fiscale_waarde en is_bedrijf bestaan al via eerdere migraties,
-- maar voegen we defensief toe voor verse omgevingen
alter table facturen add column if not exists is_bedrijf        boolean;
alter table facturen add column if not exists straat             text;
alter table facturen add column if not exists postcode           text;
alter table facturen add column if not exists plaats             text;
alter table facturen add column if not exists land               text;

create index if not exists facturen_documenttype_idx
  on facturen(documenttype, gearchiveerd, status);
