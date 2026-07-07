export function shortDebugId(value?: string | null) {
  if (!value) {
    return undefined;
  }

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function hasDebugValue(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}
