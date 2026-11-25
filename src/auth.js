// Password hashing and role permissions (SRS FR 5.1, FR 5.2, NFR 1).
// Passwords are never stored: only a salted PBKDF2-SHA-256 hash is kept.
// Uses the Web Crypto API, which is built into browsers and Node 18+.

export const PBKDF2_ITERATIONS = 100000;

const toHex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

export function randomSalt() {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations },
    key,
    256,
  );
  return toHex(bits);
}

/** Compares in constant time so the check does not leak how many characters matched. */
export async function verifyPassword(password, user) {
  const hash = await hashPassword(password, user.salt, user.iterations ?? PBKDF2_ITERATIONS);
  if (hash.length !== user.passwordHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i += 1) diff |= hash.charCodeAt(i) ^ user.passwordHash.charCodeAt(i);
  return diff === 0;
}

// What each role may do (SRS FR 5.2 and business rule 5.3).
export const PERMISSIONS = {
  viewSites: ['ADMIN', 'INSPECTOR'],
  viewReports: ['ADMIN', 'INSPECTOR'],
  recordInspection: ['INSPECTOR'],
  manageSites: ['ADMIN'],
  adjustWeights: ['ADMIN'],
  exportCsv: ['ADMIN'],
  manageUsers: ['ADMIN'],
  manageData: ['ADMIN'],
};

export function can(role, action) {
  return (PERMISSIONS[action] ?? []).includes(role);
}
