const KEY = 'ILOGIDOCPAFECFLOGICBOXI';

export function crypt(action: 'C' | 'D', src: string): string {
  if (!src) return '';

  const key = KEY;
  const keyLen = key.length;
  let keyPos = 0;
  let dest = '';

  if (action === 'C') {
    const offSet = Math.floor(Math.random() * 255);
    dest = ('0' + offSet.toString(16)).slice(-2).toUpperCase();
    let currentOffset = offSet;

    for (let srcPos = 0; srcPos < src.length; srcPos++) {
      const srcAsc = src.charCodeAt(srcPos);
      keyPos = keyPos < keyLen ? keyPos + 1 : 1;

      let tmpSrcAsc = srcAsc + currentOffset;
      if (tmpSrcAsc > 255) tmpSrcAsc -= 255;
      tmpSrcAsc = tmpSrcAsc ^ key.charCodeAt(keyPos - 1);

      dest += ('0' + tmpSrcAsc.toString(16)).slice(-2).toUpperCase();
      currentOffset = tmpSrcAsc;
    }
    return dest;
  } else {
    let offSet = parseInt(src.substring(0, 2), 16);
    let srcPos = 3;

    while (srcPos <= src.length) {
      const srcAsc = parseInt(src.substring(srcPos - 1, srcPos + 1), 16);
      keyPos = keyPos < keyLen ? keyPos + 1 : 1;

      let tmpSrcAsc = srcAsc ^ key.charCodeAt(keyPos - 1);
      if (tmpSrcAsc <= offSet) {
        tmpSrcAsc = 255 + tmpSrcAsc - offSet;
      } else {
        tmpSrcAsc -= offSet;
      }
      dest += String.fromCharCode(tmpSrcAsc);
      offSet = srcAsc;
      srcPos += 2;
    }
    return dest;
  }
}
