/**
 * Application-wide constants.
 */

/** Default user_id pre-filled in filters. Override via VITE_DEFAULT_USER_ID env var. */
export const DEFAULT_USER_ID: string = import.meta.env.VITE_DEFAULT_USER_ID ?? 'far';

/** Sentinel value stored in localStorage when auth is not required (no ADMIN_API_KEY). */
export const AUTH_NO_KEY_SENTINEL = '__no_key__';
