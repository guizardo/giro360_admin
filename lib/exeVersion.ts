// Le o FileVersion (X.Y.Z.W) do recurso VERSIONINFO de um .exe do Windows no
// navegador -- mesmo algoritmo do backend (config/exeVersion.js), que continua
// sendo quem valida de verdade no upload. Aqui so' preenche o campo na hora.
// Procura a chave UTF-16 "VS_VERSION_INFO" e, logo depois, a assinatura do
// VS_FIXEDFILEINFO (0xFEEF04BD) seguida de dwStrucVersion/FileVersionMS/LS.

const ASSINATURA = 0xfeef04bd;

function utf16(texto: string): number[] {
  return Array.from(texto).flatMap(c => [c.charCodeAt(0), 0]);
}

const CHAVE = utf16('VS_VERSION_INFO');

function acharSequencia(bytes: Uint8Array, seq: number[], desde: number): number {
  const primeiro = seq[0];
  for (let i = bytes.indexOf(primeiro, desde); i !== -1 && i <= bytes.length - seq.length; i = bytes.indexOf(primeiro, i + 1)) {
    let ok = true;
    for (let j = 1; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

async function lerBytes(arquivo: File): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null; // "MZ"
  return bytes;
}

export async function lerVersaoExe(arquivo: File): Promise<string | null> {
  const bytes = await lerBytes(arquivo);
  if (!bytes) return null;
  const view = new DataView(bytes.buffer);

  for (let pos = acharSequencia(bytes, CHAVE, 0); pos !== -1; pos = acharSequencia(bytes, CHAVE, pos + 1)) {
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

// Le um texto do StringFileInfo do VERSIONINFO (ex.: "OriginalFilename").
// Estrutura String: chave UTF-16 terminada em 0, alinhamento em 4 bytes, valor
// UTF-16 terminado em 0. Vazio quando nao existe ou esta em branco.
export async function lerTextoVersaoExe(arquivo: File, chave: string): Promise<string> {
  const bytes = await lerBytes(arquivo);
  if (!bytes) return '';
  const seq = [...utf16(chave), 0, 0];
  const pos = acharSequencia(bytes, seq, 0);
  if (pos === -1) return '';
  let p = pos + seq.length;
  while (p % 4 !== 0) p++;
  let texto = '';
  for (; p + 1 < bytes.length && texto.length < 260; p += 2) {
    const c = bytes[p] | (bytes[p + 1] << 8);
    if (c === 0) break;
    texto += String.fromCharCode(c);
  }
  return texto.trim();
}

// Aplicacao do catalogo de versoes a partir do nome do executavel. Aceita copias
// renomeadas pelo Windows/IDE ("MVC_LOGIDOC (1).exe", "CloudflaredService10.exe").
export type ProdutoRelease = 'mvc_logidoc' | 'petshop_api' | 'logidoc_api_rest' | 'cloudflared_service' | 'monitor_giro';

const PRODUTO_POR_NOME: [RegExp, ProdutoRelease][] = [
  [/^mvc_logidoc/i,        'mvc_logidoc'],
  [/^petshop_api/i,        'petshop_api'],
  [/^logidoc_api_rest/i,   'logidoc_api_rest'],
  [/^cloudflaredservice/i, 'cloudflared_service'],
  [/^monitorgiro/i,        'monitor_giro'],
];

export function produtoPorNomeExe(nome: string): ProdutoRelease | null {
  const base = (nome.split(/[\\/]/).pop() || '').trim();
  for (const [re, produto] of PRODUTO_POR_NOME) if (re.test(base)) return produto;
  return null;
}
