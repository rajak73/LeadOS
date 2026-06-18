// gzip response compression.
import compression from 'compression';
import type { RequestHandler } from 'express';

export const compressionMiddleware: RequestHandler = compression();
