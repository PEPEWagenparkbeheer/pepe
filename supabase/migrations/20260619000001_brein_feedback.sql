-- Medewerkersfeedback waarmee toekomstige conceptreacties van BREIN en BREIN Leads
-- direct worden verbeterd. De bron en het toenmalige concept blijven bewaard voor
-- herleidbaarheid; alleen actieve feedback wordt aan nieuwe prompts toegevoegd.
create table if not exists public.brein_feedback (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('brein', 'leads')),
  feedback text not null check (char_length(feedback) between 3 and 1000),
  source_id text,
  original_context text,
  concept_response text,
  created_by text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists brein_feedback_scope_active_created_idx
  on public.brein_feedback (scope, active, created_at desc);

alter table public.brein_feedback enable row level security;
drop policy if exists "pepe_all" on public.brein_feedback;
create policy "pepe_all" on public.brein_feedback
  for all to authenticated
  using (public.is_pepe())
  with check (public.is_pepe());
