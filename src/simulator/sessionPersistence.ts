/**
 * Session Persistence - localStorage-based resume capability
 * Saves and loads upload sessions for recovery after browser refresh
 */

import { PersistedSession } from './types';

const STORAGE_KEY = 'upload_simulator_session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveSession(session: PersistedSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[SessionPersistence] Failed to save session:', e);
  }
}

export function loadSession(): PersistedSession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const session = JSON.parse(stored) as PersistedSession;
    
    // Check if session is too old
    const age = Date.now() - session.checkpointAt;
    if (age > SESSION_MAX_AGE_MS) {
      clearSession();
      return null;
    }

    return session;
  } catch (e) {
    console.warn('[SessionPersistence] Failed to load session:', e);
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[SessionPersistence] Failed to clear session:', e);
  }
}

export function updateSessionCheckpoint(
  uploadedChunks: number,
  completedChunks: number[]
): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const session = JSON.parse(stored) as PersistedSession;
    session.uploadedChunks = uploadedChunks;
    session.completedChunks = completedChunks;
    session.checkpointAt = Date.now();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[SessionPersistence] Failed to update checkpoint:', e);
  }
}

export function hasResumableSession(): boolean {
  return loadSession() !== null;
}

export function generateSessionId(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
