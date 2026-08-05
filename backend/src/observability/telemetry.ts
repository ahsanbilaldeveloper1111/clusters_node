/**
 * OpenTelemetry bootstrap — must load before Express/pg for auto-instrumentation.
 * Exports traces via OTLP HTTP (Tempo/Jaeger/Collector).
 * Disabled when OTEL_ENABLED=false or unset in test.
 */
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let started = false;

export async function startTelemetry(): Promise<void> {
  if (started || !env.OTEL_ENABLED || env.NODE_ENV === 'test') return;
  started = true;

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
      '@opentelemetry/semantic-conventions'
    );

    const exporter = new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    });

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: '1.0.0',
        'deployment.environment': env.NODE_ENV,
      }),
      traceExporter: exporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    logger.info(
      { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT, service: env.OTEL_SERVICE_NAME },
      'OpenTelemetry tracing started'
    );

    const shutdown = async () => {
      try {
        await sdk.shutdown();
      } catch (err) {
        logger.warn({ err }, 'OTel shutdown error');
      }
    };
    process.once('SIGTERM', () => void shutdown());
    process.once('SIGINT', () => void shutdown());
  } catch (err) {
    logger.warn(
      { err },
      'OpenTelemetry packages missing or failed — continue without tracing (npm i in backend)'
    );
  }
}
