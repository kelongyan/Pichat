export function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}
