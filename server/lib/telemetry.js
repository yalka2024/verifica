/**
 * Verifica — OpenTelemetry bootstrap
 *
 * Initializes tracing + metrics if OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * No-op otherwise. Loaded BEFORE any other module so auto-instrumentations
 * can monkey-patch http/express/prisma/etc.
 *
 * Usage in index.js:
 *   require('./lib/telemetry').init();
 *   const express = require('express');
 *   ...
 */

let started = false;
let sdk = null;

function init() {
  if (started) return;
  started = true;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return; // observability disabled
  }
  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'verifica',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.GIT_SHA || '0.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`,
      }),
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      })],
    });
    sdk.start();
    console.log('[telemetry] OpenTelemetry SDK started');
  } catch (err) {
    console.warn('[telemetry] OTel SDK unavailable:', err.message);
    sdk = null;
  }
}

async function shutdown() {
  if (!sdk) return;
  const timeoutMs = Number(process.env.OTEL_SHUTDOWN_TIMEOUT_MS || 5000);
  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('telemetry shutdown timed out')), timeoutMs)),
    ]);
  } catch (err) {
    console.warn('[telemetry] shutdown incomplete:', err.message);
  }
  sdk = null;
}

module.exports = { init, shutdown };

