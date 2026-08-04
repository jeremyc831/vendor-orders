'use client';

import { useSyncExternalStore } from 'react';

const KEY = 'playbook-your-name';

let listeners: Array<() => void> = [];

// Session-only fallback so the field still works when localStorage is blocked.
let memName: string | null = null;

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? memName ?? '';
  } catch {
    return memName ?? '';
  }
}

function getServerSnapshot(): string {
  return '';
}

/**
 * "Your name" field persisted in localStorage — the app has one shared login,
 * so attribution on edits and mistake reports is self-declared. Persisting it
 * keeps the mistake quick-add under 30 seconds.
 */
export function useStoredName(): [string, (v: string) => void] {
  const name = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = (v: string) => {
    memName = v;
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // ignore — memName carries the value for this session
    }
    listeners.forEach(l => l());
  };

  return [name, update];
}
