/*
 * The one part of node-postgres the app calls directly
 * (start/database_types.ts). pg ships no TypeScript types, and @types/pg
 * is not a dependency.
 */
declare module 'pg' {
  const pg: {
    types: { setTypeParser(oid: number, parse: (text: string) => unknown): void }
  }
  export default pg
}
