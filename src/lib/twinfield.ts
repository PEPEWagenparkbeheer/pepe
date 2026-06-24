import { TwinfieldAuthError } from './twinfield/auth';
import { findOrCreateDebtor, createSalesInvoice } from './twinfield/invoices';

export interface TwinfieldFactuurInput {
  werk_derden_id: string;
  kenteken: string;
  klant?: string;
  partner: string;
  regels: { omschrijving: string; bedrag: number }[];
  btw_pct: number;
  verkoop_bedrag: number;   // incl. marge, ex BTW
  notitie?: string;
}

export interface TwinfieldFactuurResult {
  ok: boolean;
  invoice_id?: string;
  error?: string;
}

export async function createTwinfieldInvoice(
  input: TwinfieldFactuurInput,
): Promise<TwinfieldFactuurResult> {
  try {
    const naam = input.klant?.trim() || input.partner;
    const debiteurCode = await findOrCreateDebtor(naam);
    return await createSalesInvoice(input, debiteurCode);
  } catch (err) {
    if (err instanceof TwinfieldAuthError) {
      return { ok: false, error: `Twinfield niet gekoppeld (${err.code})` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
