import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requirePepe } from '@/lib/apiAuth';
import { searchContactCandidates, searchCompanyCandidates } from '@/lib/hubspot';
import type { MatchKandidaat } from '@/types/match';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requirePepe(req);
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: factuur } = await admin.from('facturen').select('*').eq('id', id).single();
  if (!factuur) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

  const dt = String(factuur.documenttype ?? 'factuur');

  if (dt === 'autokosten') {
    return NextResponse.json({ berijder: { kandidaten: [] }, bedrijf: { kandidaten: [] } });
  }

  const bedrijfNaam = String(factuur.bedrijfsnaam ?? '').trim();
  const bedrijfKandidaten = bedrijfNaam
    ? await searchCompanyCandidates(
        bedrijfNaam,
        factuur.kvk ? String(factuur.kvk) : null,
        factuur.postcode ? String(factuur.postcode) : null,
        factuur.straat ? String(factuur.straat) : null,
      )
    : [];

  const berijderNaam = String(factuur.berijder_naam ?? '').trim();
  let berijderKandidaten: MatchKandidaat[] = [];
  if (berijderNaam) {
    const delen = berijderNaam.split(/\s+/);
    // "T. Kaplan" → voornaam="T.", achternaam="Kaplan"; "Kaplan" → achternaam="Kaplan"
    const heeftVoornaam = delen.length > 1;
    const voornaam = heeftVoornaam ? delen[0] : null;
    const achternaam = heeftVoornaam ? delen.slice(1).join(' ') : delen[0];
    berijderKandidaten = await searchContactCandidates(
      achternaam,
      voornaam,
      bedrijfKandidaten[0]?.id ?? null,
    );
  }

  return NextResponse.json({
    berijder: { kandidaten: berijderKandidaten },
    bedrijf: { kandidaten: bedrijfKandidaten },
  });
}
