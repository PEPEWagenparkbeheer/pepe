import type { TenderInput, LeasePortaal, TransparencyItem } from '@/lib/types/tender';

export interface PortaalCredentials {
  url: string;
  user: string;
  pass: string;
}

export interface AgentResult {
  portaal: LeasePortaal;
  status: 'completed' | 'failed';
  maandprijs?: number;
  pdf_buffer?: Buffer;
  pdf_filename?: string;
  transparency_check?: TransparencyItem[];
  error_message?: string;
  raw?: Record<string, unknown>;
  duration_ms: number;
}

export interface AgentContext {
  tender: TenderInput;
  credentials: PortaalCredentials;
  signal?: AbortSignal;
}

/** Helper: leest portaal-credentials uit env-vars. Throws als incompleet. */
export function getPortaalCredentials(portaal: LeasePortaal): PortaalCredentials {
  const upper = portaal.toUpperCase();
  const url = process.env[`${upper}_URL`];
  const user = process.env[`${upper}_USER`];
  const pass = process.env[`${upper}_PASS`];
  if (!url || !user || !pass) {
    throw new Error(`Portaal ${portaal} ontbreekt env-vars (${upper}_URL/_USER/_PASS)`);
  }
  return { url, user, pass };
}
