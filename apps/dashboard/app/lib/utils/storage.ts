type Primitive = string | number | boolean | null | undefined;
type StorageValue = Primitive | Record<string, Primitive> | Primitive[];

const listeners = new Set<(key: string) => void>();

export const storage = {
  get<T extends StorageValue>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  set<T extends StorageValue>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      listeners.forEach((fn) => fn(key));
    } catch {
      // Quota exceeded or unavailable
    }
  },

  remove(key: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
    listeners.forEach((fn) => fn(key));
  },

  subscribe(fn: (key: string) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useLocalStorage<T extends StorageValue>(
  key: string,
  fallback: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const getValue = () => storage.get(key, fallback);
  const setValue = (value: T | ((prev: T) => T)) => {
    const next = typeof value === "function" ? (value as (prev: T) => T)(getValue()) : value;
    storage.set(key, next);
  };
  return [getValue(), setValue];
}