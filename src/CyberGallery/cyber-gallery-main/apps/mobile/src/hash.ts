import RNFS from 'react-native-fs';
// Use react-native-quick-crypto if installed for native sha256; falls back to JS impl.
let QuickCrypto: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  QuickCrypto = require('react-native-quick-crypto');
} catch {}

const CHUNK = 1024 * 1024; // 1 MB

export async function sha256File(path: string): Promise<string> {
  if (QuickCrypto?.createHash) {
    const hash = QuickCrypto.createHash('sha256');
    const size = (await RNFS.stat(path)).size;
    let offset = 0;
    while (offset < size) {
      const len = Math.min(CHUNK, size - offset);
      const b64 = await RNFS.read(path, len, offset, 'base64');
      hash.update(Buffer.from(b64, 'base64'));
      offset += len;
    }
    return hash.digest('hex');
  }
  // Fallback: read whole file and use RNFS.hash (md5/sha256 supported on Android)
  return RNFS.hash(path, 'sha256');
}
