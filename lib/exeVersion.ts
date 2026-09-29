// Le o FileVersion (X.Y.Z.W) do recurso VERSIONINFO de um .exe do Windows no
// navegador -- mesmo algoritmo do backend (config/exeVersion.js), que continua
// sendo quem valida de verdade no upload. Aqui so' preenche o campo na hora.
// Procura a chave UTF-16 "VS_VERSION_INFO" e, logo depois, a assinatura do
// VS_FIXEDFILEINFO (0xFEEF04BD) seguida de dwStrucVersion/FileVersionMS/LS.

const ASSINATURA = 0xfeef04bd;
const CHAVE = Array.from('VS_VERSION_INFO').flatMap(c => [c.charCodeAt(0), 0]);

function acharChave(bytes: Uint8Array, desde: number): number {
  const primeiro = CHAVE[0];
  for (let i = bytes.indexOf(primeiro, desde); i !== -1 && i <= bytes.length - CHAVE.length; i = bytes.indexOf(primeiro, i + 1)) {
    let ok = true;
    for (let j = 1; j < CHAVE.length; j++) {
      if (bytes[i + j] !== CHAVE[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

export async function lerVersaoExe(arquivo: File): Promise<string | null> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null; // "MZ"
  const view = new DataView(bytes.buffer);

  for (let pos = acharChave(bytes, 0); pos !== -1; pos = acharChave(bytes, pos + 1)) {
    const inicio = pos + CHAVE.length;
    for (let p = inicio; p < inicio + 16 && p + 16 <= bytes.length; p++) {
      if (view.getUint32(p, true) === ASSINATURA) {
        const ms = view.getUint32(p + 8, true);
        const ls = view.getUint32(p + 12, true);
        const v = `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
        return v === '0.0.0.0' ? null : v;
      }
    }
  }
  return null;
}
