import { NextResponse } from 'next/server';

// Orders worden handmatig aangemaakt in het TransConnect portaal.
// Dit endpoint is niet actief.
export async function POST() {
  return NextResponse.json({ error: 'Niet in gebruik' }, { status: 410 });
}
