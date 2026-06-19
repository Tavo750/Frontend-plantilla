import { Injectable } from '@angular/core';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Caché en localStorage con TTL de 24 horas.
 * Usado para datos estáticos (aeropuertos, aerolíneas, políticas)
 * que cambian raramente, evitando consultas repetidas a la BD.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {

  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

  set<T>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = { data, expiresAt: Date.now() + this.TTL_MS };
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // localStorage lleno o bloqueado — ignorar silenciosamente
    }
  }

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  invalidate(key: string): void {
    localStorage.removeItem(key);
  }

  invalidateAll(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('dp1_cache_'));
    keys.forEach(k => localStorage.removeItem(k));
  }
}
