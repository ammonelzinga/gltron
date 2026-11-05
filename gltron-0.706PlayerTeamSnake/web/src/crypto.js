const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

export function randomSalt() {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}
async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations: 150000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function seal(value, password, salt) {
  if (!password) return { plain: value };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return { iv: toBase64(iv), data: toBase64(encrypted) };
}

export async function open(envelope, password, salt) {
  if ('plain' in envelope) return envelope.plain;
  try {
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data));
    return JSON.parse(decoder.decode(decrypted));
  } catch {
    throw new Error('The lobby password is incorrect.');
  }
}
