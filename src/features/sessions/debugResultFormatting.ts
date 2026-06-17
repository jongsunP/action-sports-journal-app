import type { EvidenceConfidence } from '../../types';

export type DebugRow = {
  label: string;
  value: string;
};

export function formatDebugValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'unknown';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'unknown';
  }

  if (typeof value === 'string') {
    return value;
  }

  return stringifyDebugJson(value);
}

export function formatConfidence(value?: EvidenceConfidence | null): string {
  return value ?? 'unknown';
}

export function formatDebugList(values?: string[] | null): string {
  if (!values || values.length === 0) {
    return 'none';
  }

  return values.join(', ');
}

export function stringifyDebugJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
}

export function compactDebugRows(
  entries: Array<[label: string, value: unknown]>,
): DebugRow[] {
  return entries.map(([label, value]) => ({
    label,
    value: formatDebugValue(value),
  }));
}
