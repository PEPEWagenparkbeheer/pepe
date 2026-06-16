// Provider-agnostische mail-helper.
// Nu: Postmark HTTP API (geen npm-dependency nodig).
// Swappen naar Microsoft 365 Graph: vervang de body van verstuurMail() door
//   POST {GRAPH}/users/{mailbox}/sendMail met Bearer-token.

const FROM = process.env.MAIL_FROM ?? 'info@pepewagenparkbeheer.nl';
const POSTMARK_URL = 'https://api.postmarkapp.com/email';

export interface MailOpties {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function verstuurMail(opties: MailOpties): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    console.warn('verstuurMail: POSTMARK_SERVER_TOKEN niet ingesteld — mail overgeslagen');
    return;
  }

  const res = await fetch(POSTMARK_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: FROM,
      To: opties.to,
      Subject: opties.subject,
      HtmlBody: opties.html,
      ReplyTo: opties.replyTo ?? FROM,
      MessageStream: 'pepe-flow',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark fout ${res.status}: ${body}`);
  }
}
