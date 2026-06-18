// Cross-cutting shared types. Most domain types are inferred from Zod schemas; this file
// holds hand-written types that are not schema-derived.

export interface RequestContextMeta {
  requestId: string;
  organizationId?: string;
  userId?: string;
}
