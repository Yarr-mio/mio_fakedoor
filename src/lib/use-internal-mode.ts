'use client';
import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
const snapshot = () => new URLSearchParams(window.location.search).get('internal') === '1';
// Presentation switch only, not authentication. No server data is exposed.
export function useInternalMode() { return useSyncExternalStore(subscribe, snapshot, () => false); }
