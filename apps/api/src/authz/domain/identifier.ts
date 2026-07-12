const IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value);
}
