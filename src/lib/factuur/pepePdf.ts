// Gedeelde PEPE jsPDF-helpers (logo-loaders). Hergebruikt door zowel de inkoopverklaring
// (ConsignatieModal) als de uitgaande facturen — zo geen dubbele PDF-code/engine.
// Client-only (gebruikt fetch/Image/canvas).

export interface LogoPng { data: string; aspect: number }

/** Wit PEPE-logo (voor donkere header-band) als PNG-dataURL. */
export async function loadWitLogoAsPng(): Promise<LogoPng | null> {
  try {
    const res = await fetch('/pepe-logo-cmyk-wit.svg');
    let svgText = await res.text();

    let aspect = 4;
    const vb = svgText.match(/viewBox=["']([\d.\-\s]+)["']/);
    if (vb) {
      const parts = vb[1].split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) aspect = parts[2] / parts[3];
    }
    if (!/<svg[^>]*\swidth=/.test(svgText)) {
      const targetW = 1200;
      svgText = svgText.replace(/<svg/, `<svg width="${targetW}" height="${Math.round(targetW / aspect)}"`);
    }
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = Math.round(1600 / aspect);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    return { data: canvas.toDataURL('image/png'), aspect };
  } catch {
    return null;
  }
}

/** Kleuren PEPE-logo (voor witte documenten) als PNG-dataURL. */
export async function loadRgbLogoAsPng(): Promise<LogoPng | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = '/pepe-logo-rgb.png';
    });
    const w = img.naturalWidth || 1200;
    const h = img.naturalHeight || 300;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: canvas.toDataURL('image/png'), aspect: w / h };
  } catch {
    return null;
  }
}
