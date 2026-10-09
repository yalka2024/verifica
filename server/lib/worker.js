/**
 * Verifica — Background Worker
 *
 * Two execution modes:
 *   - REDIS_URL set: BullMQ queue + Worker (multi-process, retry, persistence)
 *   - else        : in-process FIFO queue (dev/single-node fallback)
 *
 * Both modes share the same runJob() pipeline so behavior is identical.
 */

const path = require('path');
const prisma = require('./prisma');
const storage = require('./storage');
const metrics = require('./metrics');

const QUEUE_NAME = 'verifica-jobs';
const REDIS_URL = process.env.REDIS_URL || '';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '4', 10);

// ── Mode A: BullMQ ───────────────────────────────────────────
let bullQueue = null;
let bullWorker = null;
function initBull() {
  if (bullQueue || !REDIS_URL) return null;
  try {
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    bullQueue = new Queue(QUEUE_NAME, { connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      }
    });
  } catch (err) {
    console.warn('[worker] BullMQ unavailable; falling back to in-process queue:', err.message);
    bullQueue = null;
  }
  return bullQueue;
}

function startBullWorker() {
  if (bullWorker || !REDIS_URL) return null;
  try {
    const { Worker } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
    bullWorker = new Worker(QUEUE_NAME, async (job) => runJob(job.data), {
      connection, concurrency: CONCURRENCY,
    });
    bullWorker.on('failed', (job, err) => {
      console.error(`[worker] job ${job?.id} failed:`, err.message);
    });
    bullWorker.on('completed', (job) => {
      console.log(`[worker] job ${job.id} completed`);
    });
    return bullWorker;
  } catch (err) {
    console.warn('[worker] could not start BullMQ Worker:', err.message);
    return null;
  }
}

async function stopBullWorker() {
  try { if (bullWorker) await bullWorker.close(); } catch {}
  try { if (bullQueue)  await bullQueue.close();  } catch {}
  bullWorker = null;
  bullQueue = null;
}

// ── Mode B: in-process FIFO ──────────────────────────────────
const localQueue = [];
let localProcessing = 0;

async function processNextLocal() {
  if (localProcessing >= CONCURRENCY) return;
  const job = localQueue.shift();
  if (!job) return;
  localProcessing++;
  try {
    await runJob(job);
  } catch (err) {
    console.error(`[worker] job ${job.recordId} failed:`, err.message);
    metrics.counters.jobsFailed.inc({ reason: err.code || 'error' });
    try {
      await prisma.verification.update({
        where: { id: job.recordId },
        data: { status: 'failed' }
      });
    } catch {}
  } finally {
    localProcessing--;
    if (localQueue.length > 0) setImmediate(processNextLocal);
  }
}

// ── Public API ───────────────────────────────────────────────
function enqueueJob(recordId, storageKey, userId, userEmail) {
  const data = { recordId, storageKey, userId, userEmail };
  const q = initBull();
  if (q) {
    q.add('process', data, { jobId: recordId }).catch(err => {
      console.error('[worker] enqueue failed; using local queue:', err.message);
      localQueue.push(data); processNextLocal();
    });
    return;
  }
  localQueue.push(data);
  processNextLocal();
}

async function getQueueStatus() {
  if (REDIS_URL && bullQueue) {
    const counts = await bullQueue.getJobCounts('waiting', 'active', 'failed', 'delayed');
    return { mode: 'bullmq', ...counts };
  }
  return { mode: 'local', queued: localQueue.length, processing: localProcessing };
}

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (typeof stream === 'string') return Buffer.from(stream);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ─── Text Extraction ──────────────────────────────────

// Formats that are already text. The upload route derives its allowlist from
// the spec's `accepted_formats` and this function did not, so a spec that
// accepted .json or .csv returned 202 on upload and then threw here on every
// job. Reading them as UTF-8 is what the caller meant by "accepted".
const TEXT_EXTS = new Set(['.txt', '.text', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.ndjson', '.xml', '.yaml', '.yml', '.log', '.htm', '.html']);

async function extractText(storageKey) {
  const ext = path.extname(storageKey).toLowerCase();
  const stream = await storage.getStream(storageKey);
  const buffer = await streamToBuffer(stream);

  if (TEXT_EXTS.has(ext)) {
    return buffer.toString('utf-8');
  }

  if (ext === '.pdf') {
    try {
      const { PDFParse } = require('pdf-parse');
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      await pdf.load();
      const result = await pdf.getText();
      return result.text || '';
    } catch (err) {
      console.error('PDF extraction error:', err.message);
      return '';
    }
  }

  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (err) {
      console.error('DOCX extraction error:', err.message);
      return '';
    }
  }

  // Reached only for genuinely binary formats (images, audio, archives). Say
  // what is missing rather than just refusing: the upload route accepted this
  // file because the spec listed the extension, so the gap is an extractor,
  // not the user's file.
  throw new Error(
    `No text extractor for "${ext}". The upload allowlist accepts it because the spec lists it in accepted_formats, ` +
    'but this platform can only extract text, PDF and DOCX. Add an extractor (OCR for images, transcription for ' +
    'audio) or remove the format from the spec.'
  );
}

// ─── Domain Processing Pipeline ───────────────────────

// Declared unconditionally because runJob() below reads it no matter which
// spec features are on. It used to be declared INSIDE the {{#if}} block that
// assigns it — see the per-job note in runJob for why that broke every job.
let detectionPatternsLoaded = false;



function scoreRisk(findings, gaps) {
  const totalFindings = Object.keys(findings).length;
  const totalGaps = gaps.length;

  if (totalFindings === 0) return { overall: 'Unknown', score: 0 };

  const gapPenalty = totalGaps * 15;
  const baseScore = Math.max(0, 100 - gapPenalty);
  const score = Math.min(100, Math.max(0, baseScore));

  const level = score >= 80 ? 'Low' : score >= 50 ? 'Moderate' : score >= 25 ? 'High' : 'Critical';

  return { overall: level, score, totalFindings, totalGaps };
}

async function runJob(job) {
  // 1. Extract text (storageKey for new uploads, fallback to legacy filePath)
  const source = job.storageKey || job.filePath;
  const text = await extractText(source);
  if (!text || text.trim().length < 50) {
    throw new Error('Document is empty or too short to analyze');
  }

  // 2. Process document
  //
  // Declared here, per job, and unconditionally: both are read below whatever
  // the spec enabled. They used to be declared inside the {{#if}} blocks that
  // assign them, and `findings || {}` does not guard an UNDECLARED binding —
  // it throws ReferenceError. So a spec that enabled neither detection
  // patterns nor required items shipped a worker that failed every single job
  // while the API kept answering 202 'Queued for processing'. Per-job rather
  // than module-level so two concurrent jobs cannot overwrite each other.
  let findings = {};
  let gaps = [];



  // 3. Score risk
  const risk = scoreRisk(findings, gaps);

  // 4. Build report
  const report = {
    findings,
    gaps,
    risk,
    // Distinguishes "no rules were loaded" from "rules ran and found nothing" —
    // the difference between an unconfigured engine and a clean document.
    scored: detectionPatternsLoaded,
    processedAt: new Date().toISOString(),
    textLength: text.length
  };

  // 5. Save results
  await prisma.verification.update({
    where: { id: job.recordId },
    data: {
      status: 'completed',
      riskScore: detectionPatternsLoaded ? risk.score : null,
      overallRisk: detectionPatternsLoaded ? risk.overall : 'unscored',
      reportJson: JSON.stringify(report)
    }
  });

  metrics.counters.jobsProcessed.inc({ outcome: 'completed' });
  console.log(`Job ${job.recordId} completed: ${risk.overall} risk (score: ${risk.score})`);
}

module.exports = { enqueueJob, getQueueStatus, runJob, startBullWorker, stopBullWorker };

