// OpenTelemetry tracing init (OBS-1.2). Guarded by OTEL_EXPORTER_OTLP_ENDPOINT — absent =
// disabled (dev/test no-op). Service name comes from OTEL_SERVICE_NAME (read by the SDK).
// Kept intentionally minimal for Sprint 1: an OTLP trace exporter, started only when a
// collector endpoint is configured.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let sdk: NodeSDK | undefined;

export function initTracing(): void {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.debug('OpenTelemetry tracing disabled (no OTEL_EXPORTER_OTLP_ENDPOINT)');
    return;
  }
  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  });
  sdk.start();
  logger.info('OpenTelemetry tracing initialized');
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) await sdk.shutdown();
}
