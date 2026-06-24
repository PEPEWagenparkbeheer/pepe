import { getValidAccessToken } from './auth';

export interface TwinfieldOffice {
  code: string;
  name: string;
}

// Twinfield SOAP (WSDL-geverifieerd):
//  - operations + Header-element zitten in http://www.twinfield.com/
//  - SOAPAction = http://www.twinfield.com/<Operation>
//  - de Finder-service (finder.asmx) werkt NIET stateless met OAuth (vereist een
//    SelectCompany-sessie → "code 100" serverfout). Daarom doen we ALLES via de
//    ProcessXml-service: administraties, dimensies (debiteuren), facturen.
const TWF_NS = 'http://www.twinfield.com/';

/**
 * Bouwt de SOAP-envelope met de OAuth-authenticatieheader.
 * De Twinfield-services verwachten één <Header>-element (in de TWF-namespace)
 * dat AccessToken + CompanyCode omvat — NIET losse elementen in een /Auth-namespace.
 * CompanyCode is verplicht voor administratie-specifieke acties (dimensies, facturen)
 * en wordt weggelaten voor administratie-overstijgende acties (offices ophalen).
 */
function buildSoapEnvelope(accessToken: string, companyCode: string, body: string): string {
  const companyEl = companyCode ? `<CompanyCode>${companyCode}</CompanyCode>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <Header xmlns="${TWF_NS}">
      <AccessToken>${accessToken}</AccessToken>${companyEl}
    </Header>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

/** Haalt een SOAP-faultstring uit het antwoord, indien aanwezig. */
function extractFault(xml: string): string | null {
  const m = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(xml);
  return m ? m[1].trim() : null;
}

/** Vervangt XML-entiteiten door hun karakters (&amp; als laatste i.v.m. dubbel-escaping). */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Verstuurt een SOAP-call naar een Twinfield-service en geeft de ruwe XML terug.
 * Gooit een leesbare fout bij een HTTP-fout of een SOAP-fault.
 */
async function postSoap(
  serviceUrl: string,
  soapAction: string,
  envelope: string,
  label: string,
): Promise<string> {
  const res = await fetch(serviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${soapAction}"`,
    },
    body: envelope,
    cache: 'no-store',
  });

  const xml = await res.text();

  const fault = extractFault(xml);
  if (fault) {
    throw new Error(`Twinfield ${label} fault: ${fault}`);
  }
  if (!res.ok) {
    throw new Error(`Twinfield ${label} mislukt (${res.status}): ${xml.slice(0, 300)}`);
  }
  return xml;
}

/**
 * Roept de ProcessXml-service aan en geeft de (ge-unescapede) inner XML terug —
 * dus de inhoud van <ProcessXmlStringResult>, klaar om direct te parsen of op
 * `result="1"` te controleren.
 *
 * @param xml          het Twinfield-XML-bericht (zonder envelope)
 * @param companyCode  administratie; geef '' door voor administratie-overstijgende
 *                     acties, of laat weg om de gekozen administratie te gebruiken.
 */
export async function callProcessXml(xml: string, companyCode?: string): Promise<string> {
  const token = await getValidAccessToken();
  const company = companyCode ?? token.companyCode ?? '';
  const body = `<ProcessXmlString xmlns="${TWF_NS}"><xmlRequest><![CDATA[${xml}]]></xmlRequest></ProcessXmlString>`;
  const envelope = buildSoapEnvelope(token.accessToken, company, body);

  const raw = await postSoap(
    `${token.clusterUrl}/webservices/processxml.asmx`,
    `${TWF_NS}ProcessXmlString`,
    envelope,
    'ProcessXml',
  );

  const m = /<ProcessXmlStringResult>([\s\S]*?)<\/ProcessXmlStringResult>/.exec(raw);
  return m ? unescapeXml(m[1]) : '';
}

/** Lijst van administraties (offices) waartoe de gekoppelde gebruiker toegang heeft. */
export async function listOffices(): Promise<TwinfieldOffice[]> {
  // Administratie-overstijgend → expliciet zonder company.
  const result = await callProcessXml('<list><type>offices</type></list>', '');
  const offices: TwinfieldOffice[] = [];
  const re = /<office\s+name="([^"]*)"[^>]*>([^<]+)<\/office>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(result)) !== null) {
    offices.push({ code: m[2].trim(), name: unescapeXml(m[1]).trim() });
  }
  return offices;
}

/**
 * Haalt de dimensies van een bepaald type op (DEB = debiteuren, CRD = crediteuren,
 * enz.) binnen een administratie. Vervangt de oude, niet-werkende Finder.
 *
 * @param type         dimensietype (bijv. 'DEB')
 * @param pattern      '*' = alles; anders client-side filter op code/naam
 * @param maxRows      maximaal aantal terug te geven items
 * @param companyCode  administratie; standaard de gekozen administratie uit de token
 */
export async function finderSearch(
  type: string,
  pattern = '*',
  maxRows = 1000,
  companyCode?: string,
): Promise<Array<{ code: string; name: string }>> {
  const token = await getValidAccessToken();
  const office = companyCode ?? token.companyCode ?? '';
  if (!office) {
    throw new Error('Geen administratie gekozen (company_code) voor Twinfield-zoekopdracht');
  }

  const result = await callProcessXml(
    `<list><type>dimensions</type><office>${office}</office><dimtype>${type}</dimtype></list>`,
    office,
  );

  const items: Array<{ code: string; name: string }> = [];
  const re = /<dimension\s+name="([^"]*)"[^>]*>([^<]+)<\/dimension>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(result)) !== null) {
    items.push({ code: m[2].trim(), name: unescapeXml(m[1]).trim() });
  }

  const filtered =
    pattern && pattern !== '*'
      ? items.filter((i) => {
          const needle = pattern.replace(/\*/g, '').toLowerCase();
          return (
            i.code.toLowerCase().includes(needle) ||
            i.name.toLowerCase().includes(needle)
          );
        })
      : items;

  return filtered.slice(0, maxRows);
}
