// Zod request validation (doc 06 §6.2). Validates body/query/params against a schema and
// replaces the raw value with the parsed result. On failure throws VALIDATION_ERROR with
// per-field details (doc 10 §10.2).

import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from '../errors/app-error.js';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fields[issue.path.join('.') || '(root)'] = issue.message;
      }
      next(AppError.validation('Request validation failed', { fields }));
      return;
    }
    // Reassign the parsed/coerced value.
    Reflect.set(req, source, result.data as unknown);
    next();
  };
}

export { z };
