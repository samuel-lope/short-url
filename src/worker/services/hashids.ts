import Hashids from 'hashids';

const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getHasher(salt: string): Hashids {
  // Keeps minLength=4 to preserve compatibility with existing shorturldb records.
  return new Hashids(salt, 4, BASE62_ALPHABET);
}

export function encodeId(id: number, salt: string): string {
  return getHasher(salt).encode(id);
}

export function decodeCode(code: string, salt: string): number | null {
  const decoded = getHasher(salt).decode(code);
  return decoded.length > 0 ? Number(decoded[0]) : null;
}
