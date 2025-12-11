import Hashids from 'hashids';

/**
 * Cria uma instância do Hashids configurada.
 * @param {string} salt - A chave secreta do ambiente (env.HASH_SECRET).
 */
const getHasher = (salt) => {
  // Alfabeto Base62 padrão
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  // minLength: 7 garante que o código tenha pelo menos 7 digitos
  return new Hashids(salt, 7, alphabet);
};

export const encodeId = (id, salt) => {
  const hasher = getHasher(salt);
  return hasher.encode(id);
};

export const decodeCode = (code, salt) => {
  const hasher = getHasher(salt);
  const decoded = hasher.decode(code);
  // Hashids retorna um array. Se falhar ou for inválido, retorna vazio.
  return decoded.length > 0 ? decoded[0] : null;
};

