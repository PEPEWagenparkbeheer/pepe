import { getValidAccessToken } from './auth';

export interface TwinfieldOffice {
  code: string;
  name: string;
}

// Twinfield SOAP-namespaces (WSDL-geverifieerd):
//  - operations + Header-element zitten in http://www.twinfield.com/
//  - SOAPAction = http://www.twinfield.com/<Operation>
const TWF_NS = 'http://www.twinfield.com/';

/**
 * Bouwt de SOAP-envelope met de OAuth-authenticatieheader.
 * De Twinfield-services verwachten één <Header>-element (in de TWF-namespace)
 * dat AccessToken + CompanyCode omvat — NIET losse elementen in een /Auth-namespace.
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

function buildFinderSoapBody(type: string, pattern: string, maxRows = 100): string {
  return `<Search xmlns="${TWF_NS}">
  <query>
    <type>${type}</type>
    <pattern>${pattern}</pattern>
    <field>0</field>
    <firstRow>1</firstRow>
    <maxRows>${maxRows}</maxRows>
    <options>
      <ArrayOfSearchOption />
    </options>
  </query>
</Search>`;
}

function parseFinderItems(xml: string): Array<{ code: string; name: string }> {
  const items: Array<{ code: string; name: string }> = [];
  const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const inner = match[1];
    const codeM = /<field1>(.*?)<\/field1>/.exec(inner);
    const nameM = /<field2>(.*?)<\/field2>/.exec(inner);
    if (codeM && nameM) {
      items.push({ code: codeM[1], name: nameM[1] });
    }
  }
  return items;
}

/** Haalt een SOAP-faultstring uit het antwoord, indien aanwezig. */
function extractFault(xml: string): string | null {
  const m = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(xml);
  return m ? m[1].trim() : null;
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
 * Roept de ProcessXml-service aan (debiteuren, dimensies, facturen aanmaken).
 * @param xml  het Twinfield-XML-bericht (zonder envelope)
 * @param companyCode  optioneel: overschrijf de administratie voor deze call
 */
export async function callProcessXml(xml: string, companyCode?: string): Promise<string> {
  const token = await getValidAccessToken();
  const company = companyCode ?? token.companyCode ?? '';
  const body = `<ProcessXmlString xmlns="${TWF_NS}"><xmlRequest><![CDATA[${xml}]]></xmlRequest></ProcessXmlString>`;
  const envelope = buildSoapEnvelope(token.accessToken, company, body);

  return postSoap(
    `${token.clusterUrl}/webservices/processxml.asmx`,
    `${TWF_NS}ProcessXmlString`,
    envelope,
    'ProcessXml',
  );
}

/**
 * Zoekt via de finder-service (debiteuren, crediteuren, grootboek, ...).
 * @param companyCode  optioneel: overschrijf de administratie voor deze call
 */
export async function finderSearch(
  type: string,
  pattern: string,
  maxRows = 200,
  companyCode?: string,
): Promise<Array<{ code: string; name: string }>> {
  const token = await getValidAccessToken();
  const company = companyCode ?? token.companyCode ?? '';
  const envelope = buildSoapEnvelope(
    token.accessToken,
    company,
    buildFinderSoapBody(type, pattern, maxRows),
  );
  const xml = await postSoap(
    `${token.clusterUrl}/webservices/finder.asmx`,
    `${TWF_NS}Search`,
    envelope,
    'Finder',
  );
  return parseFinderItems(xml);
}

/** Lijst van administraties (offices) waartoe de gekoppelde gebruiker toegang heeft. */
export async function listOffices(): Promise<TwinfieldOffice[]> {
  const token = await getValidAccessToken();
  const company = token.companyCode ?? '';
  const envelope = buildSoapEnvelope(
    token.accessToken,
    company,
    buildFinderSoapBody('OFF', '*'),
  );
  const xml = await postSoap(
    `${token.clusterUrl}/webservices/finder.asmx`,
    `${TWF_NS}Search`,
    envelope,
    'Finder (offices)',
  );
  return parseFinderItems(xml);
}
