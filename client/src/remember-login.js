const storageKey = 'subtrack.remember-login';

export function readRememberedLogin() {
  try {
    const saved =
      typeof window === 'undefined'
        ? null
        : JSON.parse(globalThis.localStorage.getItem(storageKey));
    if (typeof saved?.enabled === 'boolean') {
      return {
        enabled: saved.enabled,
        email: saved.enabled && typeof saved.email === 'string' ? saved.email : '',
      };
    }
  } catch {
    // Sign-in also works when browser storage is unavailable.
  }
  return { enabled: true, email: '' };
}

export function saveRememberedLogin(email, enabled) {
  try {
    globalThis.localStorage.setItem(
      storageKey,
      JSON.stringify({ enabled, email: enabled ? email.trim() : '' })
    );
  } catch {
    // Browser privacy settings must not prevent sign-in.
  }
}
