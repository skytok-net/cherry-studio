/**
 * Provides a minimal implementation of the utilities referenced by langchain.
 */
export function insecureHash(_: string): string {
  throw new Error('Hash utilities are not available inside the artifact sandbox.')
}

