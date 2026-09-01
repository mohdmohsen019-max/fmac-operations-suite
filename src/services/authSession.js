import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from 'firebase/auth';

export const AUTH_SESSION_KEY = 'fmac_staff_session_v1';
export const REMEMBERED_SESSION_DAYS = 7;
export const REMEMBERED_SESSION_MS = REMEMBERED_SESSION_DAYS * 24 * 60 * 60 * 1000;

function safeStorage(kind) {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function parseRecord(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function createAuthSessionRecord(uid, remembered, now = Date.now()) {
  return {
    uid: String(uid || ''),
    remembered: Boolean(remembered),
    issuedAt: now,
    lastOpenedAt: now,
    expiresAt: remembered ? now + REMEMBERED_SESSION_MS : null,
  };
}

export function isAuthSessionRecordValid(record, uid, now = Date.now()) {
  if (!record || String(record.uid || '') !== String(uid || '')) return false;
  if (!record.remembered) return true;
  return Number(record.expiresAt) > now;
}

export async function applyAuthPersistence(auth, remembered) {
  await setPersistence(auth, remembered ? browserLocalPersistence : browserSessionPersistence);
}

export function saveAuthSession(uid, remembered, now = Date.now()) {
  const local = safeStorage('local');
  const session = safeStorage('session');
  local?.removeItem(AUTH_SESSION_KEY);
  session?.removeItem(AUTH_SESSION_KEY);
  const target = remembered ? local : session;
  target?.setItem(AUTH_SESSION_KEY, JSON.stringify(createAuthSessionRecord(uid, remembered, now)));
}

export function restoreAuthSession(uid, now = Date.now()) {
  const local = safeStorage('local');
  const session = safeStorage('session');
  const localRecord = parseRecord(local?.getItem(AUTH_SESSION_KEY));
  const sessionRecord = parseRecord(session?.getItem(AUTH_SESSION_KEY));
  const record = localRecord || sessionRecord;

  if (!record) {
    // Migrate Firebase sessions created before the explicit session policy.
    saveAuthSession(uid, true, now);
    return true;
  }

  if (!isAuthSessionRecordValid(record, uid, now)) {
    clearAuthSession();
    return false;
  }

  if (record.remembered) {
    local?.setItem(AUTH_SESSION_KEY, JSON.stringify({
      ...record,
      lastOpenedAt: now,
      expiresAt: now + REMEMBERED_SESSION_MS,
    }));
  }
  return true;
}

export function getAuthSessionExpiry(uid) {
  const record = parseRecord(safeStorage('local')?.getItem(AUTH_SESSION_KEY));
  if (!record?.remembered || String(record.uid || '') !== String(uid || '')) return null;
  const expiresAt = Number(record.expiresAt);
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

export function clearAuthSession() {
  safeStorage('local')?.removeItem(AUTH_SESSION_KEY);
  safeStorage('session')?.removeItem(AUTH_SESSION_KEY);
}
