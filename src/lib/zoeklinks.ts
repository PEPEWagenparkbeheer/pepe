import type { Zoekopdracht } from '@/types';

const AS24_MERKEN: Record<string, string> = {
  'audi': 'audi', 'bmw': 'bmw', 'mercedes': 'mercedes-benz', 'mercedes-benz': 'mercedes-benz',
  'volkswagen': 'volkswagen', 'vw': 'volkswagen', 'porsche': 'porsche', 'volvo': 'volvo',
  'ford': 'ford', 'opel': 'opel', 'toyota': 'toyota', 'honda': 'honda', 'mazda': 'mazda',
  'kia': 'kia', 'hyundai': 'hyundai', 'skoda': 'skoda', 'škoda': 'skoda', 'seat': 'seat', 'renault': 'renault',
  'peugeot': 'peugeot', 'citroën': 'citroen', 'citroen': 'citroen', 'ds': 'ds-automobiles', 'fiat': 'fiat', 'mini': 'mini',
  'land rover': 'land-rover', 'range rover': 'land-rover', 'jeep': 'jeep',
  'nissan': 'nissan', 'mitsubishi': 'mitsubishi', 'lexus': 'lexus', 'tesla': 'tesla',
  'jaguar': 'jaguar', 'alfa romeo': 'alfa-romeo', 'maserati': 'maserati',
  'genesis': 'genesis', 'cupra': 'cupra', 'dacia': 'dacia', 'suzuki': 'suzuki', 'subaru': 'subaru',
  'lamborghini': 'lamborghini', 'bentley': 'bentley', 'ferrari': 'ferrari',
  'smart': 'smart', 'rivian': 'rivian', 'lucid': 'lucid',
  'byd': 'byd', 'mg': 'mg', 'polestar': 'polestar', 'nio': 'nio',
  'xpeng': 'xpeng', 'leapmotor': 'leapmotor', 'ineos': 'ineos',
  'omoda': 'omoda', 'zeekr': 'zeekr',
};

const MDE_MERK_IDS: Record<string, number> = {
  'audi': 1900, 'bmw': 3500, 'mercedes': 17200, 'mercedes-benz': 17200,
  'volkswagen': 25200, 'vw': 25200, 'porsche': 20000, 'volvo': 25100,
  'ford': 9000, 'opel': 19000, 'toyota': 24100, 'honda': 11000, 'mazda': 16100,
  'kia': 13200, 'hyundai': 11600, 'skoda': 21600, 'škoda': 21600, 'seat': 21300, 'renault': 21000,
  'peugeot': 19600, 'citroën': 4900, 'citroen': 4900, 'fiat': 8900, 'mini': 17700,
  'land rover': 14800, 'range rover': 14800, 'jeep': 12600,
  'nissan': 18700, 'mitsubishi': 17600, 'lexus': 15400, 'tesla': 24150,
  'jaguar': 12500, 'alfa romeo': 1100, 'maserati': 15900,
  'genesis': 10300, 'cupra': 4960, 'dacia': 5280, 'suzuki': 23200, 'subaru': 22900,
  'ds': 4853, 'smart': 18700,
  'byd': 2026, 'mg': 17418, 'polestar': 20100, 'nio': 18100,
};

const MDE_MODEL_IDS: Record<string, Record<string, number>> = {
  'kia':        { 'ev3': 62, 'ev6': 63, 'ev9': 65, 'sportage': 7, 'sorento': 5, 'niro': 55, 'picanto': 3, 'stinger': 44, 'ceed': 52, 'xceed': 56 },
  'audi':       { 'a3': 2, 'a4': 3, 'a5': 4, 'a6': 5, 'a7': 6, 'a8': 7, 'q3': 18, 'q5': 20, 'q7': 22, 'q8': 23, 'e-tron': 50, 'q4 e-tron': 57, 'rs6': 9 },
  'bmw':        { '1 serie': 1, '2 serie': 2, '3 serie': 3, '4 serie': 4, '5 serie': 5, '7 serie': 7, 'x1': 34, 'x3': 36, 'x5': 38, 'x6': 39, 'i4': 84, 'i7': 87, 'ix': 88 },
  'volkswagen': { 'golf': 14, 'polo': 20, 'passat': 18, 'tiguan': 31, 'touareg': 34, 'sharan': 26, 'id.3': 128, 'id.4': 129, 't-roc': 109 },
  'mercedes':   { 'a-klasse': 1, 'c-klasse': 5, 'e-klasse': 8, 's-klasse': 11, 'gle': 16, 'glc': 15, 'gla': 13, 'glb': 14, 'v-klasse': 30, 'eqs': 79 },
  'mercedes-benz': { 'a-klasse': 1, 'c-klasse': 5, 'e-klasse': 8, 's-klasse': 11, 'gle': 16, 'glc': 15, 'gla': 13, 'glb': 14, 'v-klasse': 30 },
  'porsche':    { 'cayenne': 6, 'macan': 9, 'panamera': 11, 'taycan': 16, '911': 1 },
  'volvo':      { 'xc40': 16, 'xc60': 6, 'xc90': 8, 's60': 3, 'v60': 13 },
  'land rover': { 'defender': 11, 'discovery': 4, 'range rover': 7, 'range rover sport': 8, 'range rover evoque': 6 },
  'range rover':{ 'evoque': 6, 'sport': 8, 'velar': 9 },
  'toyota':     { 'yaris': 22, 'corolla': 4, 'rav4': 12, 'chr': 30, 'prius': 10 },
  'ford':       { 'focus': 8, 'fiesta': 5, 'puma': 35, 'kuga': 25, 'mustang': 20 },
  'opel':       { 'astra': 2, 'corsa': 6, 'grandland': 27, 'mokka': 17, 'insignia': 12 },
  'renault':    { 'clio': 4, 'megane': 11, 'captur': 23, 'kadjar': 25, 'austral': 35, 'espace': 8 },
  'peugeot':   { '208': 19, '308': 5, '3008': 22, '5008': 24, '508': 10 },
  'skoda':      { 'octavia': 5, 'superb': 7, 'kodiaq': 17, 'karoq': 19, 'enyaq': 28, 'fabia': 2 },
  'seat':       { 'ibiza': 3, 'leon': 5, 'arona': 20, 'ateca': 22, 'tarraco': 24 },
  'hyundai':    { 'i20': 11, 'i30': 5, 'tucson': 15, 'santa fe': 8, 'ioniq 5': 42, 'ioniq 6': 47, 'kona': 32 },
  'nissan':     { 'micra': 8, 'juke': 23, 'qashqai': 17, 'x-trail': 22, 'leaf': 30, 'ariya': 39 },
  'tesla':      { 'model 3': 2, 'model s': 1, 'model x': 3, 'model y': 4 },
  'mini':       { 'cooper': 1, 'clubman': 2, 'countryman': 3 },
  'jeep':       { 'renegade': 16, 'compass': 17, 'wrangler': 7, 'grand cherokee': 4 },
  'dacia':      { 'sandero': 3, 'duster': 5, 'logan': 2, 'jogger': 10, 'spring': 11 },
};

function parseMerkModel(auto: string): { merkSlug: string; model: string } {
  const autoLower = auto.trim().toLowerCase();
  let merkSlug = '';
  let model = auto.trim();

  for (const key of Object.keys(AS24_MERKEN)) {
    if ((autoLower.startsWith(key + ' ') || autoLower === key) && key.length > merkSlug.length) {
      merkSlug = key;
      model = auto.trim().slice(key.length).trim();
    }
  }

  if (!merkSlug) {
    const parts = auto.trim().split(/\s+/);
    merkSlug = parts[0].toLowerCase();
    model = parts.slice(1).join(' ');
  }

  return { merkSlug, model };
}

export function buildZoekLinks(r: Zoekopdracht): { as24: string; mde: string } | null {
  if (!r.auto) return null;

  const { merkSlug, model } = parseMerkModel(r.auto);
  const jaarMatch = (r.jaar ?? '').match(/\d{4}/g);
  const jaarVan = jaarMatch ? jaarMatch[0] : '';

  // AutoScout24
  const as24Merk = AS24_MERKEN[merkSlug] ?? merkSlug;
  const modelSlug = model.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  let as24 = 'https://www.autoscout24.nl/lst';
  if (as24Merk) as24 += '/' + as24Merk;
  if (modelSlug) as24 += '/' + modelSlug;
  as24 += '?atype=C&cy=D%2CA%2CB%2CE%2CF%2CI%2CL%2CNL&damaged_listing=exclude&sort=price&desc=0';
  if (jaarVan) as24 += '&fregfrom=' + jaarVan;
  as24 += '&ustate=N,U';

  // Mobile.de
  const merkId = MDE_MERK_IDS[merkSlug];
  const lookup = MDE_MODEL_IDS[merkSlug] ?? {};
  const modelId = lookup[model.toLowerCase()] ?? null;
  let mde = 'https://www.mobile.de/nl/voertuigen/zoek.html?sb=p&od=up&vc=Car';
  if (merkId) mde += '&ms=' + merkId + (modelId ? '%3B' + modelId : '');
  if (jaarVan) mde += '&fr=' + jaarVan + '%3A';
  mde += '&s=Car&ref=srpHead';

  return { as24, mde };
}
