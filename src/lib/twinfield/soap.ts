import { getValidAccessToken } from './auth';

export interface TwinfieldOffice {
  code: string;
  name: string;
}

function buildSoapEnvelope(accessToken: string, companyCode: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AccessToken xmlns="https://accounting.twinfield.com/Auth">${accessToken}</AccessToken>
    <CompanyCode xmlns="https://accounting.twinfield.com/Auth">${companyCode}</CompanyCode>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

function buildFinderSoapBody(type: string, pattern: string, maxRows = 100): string {
  return `<Search xmlns="http://www.twinfield.com/Api">
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

export async function callProcessXml(xml: string): Promise<string> {
  const token = await getValidAccessToken();
  const companyCode = token.companyCode ?? '';
  const body = `<ProcessXmlString xmlns="http://www.twinfield.com/Api"><xmlRequest><![CDATA[${xml}]]></xmlRequest></ProcessXmlString>`;
  const envelope = buildSoapEnvelope(token.accessToken, companyCode, body);

  const res = await fetch(`${token.clusterUrl}/webservices/ProcessXmlService.asmx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://www.twinfield.com/Api/ProcessXmlString"',
    },
    body: envelope,
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`ProcessXml mislukt (${res.status})`);
  return res.text();
}

export async function finderSearch(
  type: string,
  pattern: string,
  maxRows = 200,
): Promise<Array<{ code: string; name: string }>> {
  const token = await getValidAccessToken();
  const companyCode = token.companyCode ?? '';
  const envelope = buildSoapEnvelope(
    token.accessToken,
    companyCode,
    buildFinderSoapBody(type, pattern, maxRows),
  );
  const res = await fetch(`${token.clusterUrl}/webservices/finder.asmx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://www.twinfield.com/Api/Search"',
    },
    body: envelope,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Finder mislukt (${res.status})`);
  return parseFinderItems(await res.text());
}

export async function listOffices(): Promise<TwinfieldOffice[]> {
  const token = await getValidAccessToken();
  // Finder requires a company code for auth, but for office listing we use a wildcard
  // and any valid company code (or empty) — use '*' as dummy if none selected yet
  const companyCode = token.companyCode ?? '';

  const envelope = buildSoapEnvelope(
    token.accessToken,
    companyCode,
    buildFinderSoapBody('OFF', '*'),
  );

  const res = await fetch(`${token.clusterUrl}/webservices/finder.asmx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://www.twinfield.com/Api/Search"',
    },
    body: envelope,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Finder-aanroep mislukt (${res.status})`);
  }

  const xml = await res.text();
  return parseFinderItems(xml);
}
