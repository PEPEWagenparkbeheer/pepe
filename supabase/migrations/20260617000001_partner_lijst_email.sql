-- E-mailadres per partner voor WerkDerden-notificaties.
ALTER TABLE public.partner_lijst
  ADD COLUMN IF NOT EXISTS email TEXT;
