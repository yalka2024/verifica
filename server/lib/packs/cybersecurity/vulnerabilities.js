/**
 * Cybersecurity pack — vulnerability prioritization (real, validated domain logic).
 *
 * Assembled into Verifica because it targets cybersecurity / SOC.
 * Ranks vulnerabilities by CVSS base severity, EPSS exploit probability, and asset
 * criticality — the SOC triage math that turns a scanner dump into a worklist.
 * Actual scanning / intel feeds are credential-gated adapters, NOT faked here.
 */
'use strict';

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

const ASSET_WEIGHT = { low: 1, medium: 2, high: 3, critical: 4 };

function assetWeight(criticality) {
  const w = ASSET_WEIGHT[String(criticality || '').toLowerCase()];
  return w === undefined ? 1 : w;
}

// v: { cvss(0..10), epss(0..1), assetCriticality } → 0..40 (higher = remediate sooner).
function priorityScore(v) {
  const o = v || {};
  const cvss = clamp(o.cvss, 0, 10);
  const epss = clamp(o.epss, 0, 1);
  return round2(cvss * (0.5 + 0.5 * epss) * assetWeight(o.assetCriticality));
}

function priorityBucket(score) {
  const s = Number(score) || 0;
  if (s >= 24) return 'P1';
  if (s >= 12) return 'P2';
  if (s >= 4) return 'P3';
  return 'P4';
}

const SLA_DAYS = { P1: 7, P2: 30, P3: 90, P4: 180 };
function remediationSLADays(bucket) {
  return SLA_DAYS[bucket] !== undefined ? SLA_DAYS[bucket] : 180;
}

// Rank a set of vulnerabilities worst-first, tagging bucket + remediation SLA.
function prioritize(vulns) {
  return (Array.isArray(vulns) ? vulns : [])
    .filter((v) => v)
    .map((v) => {
      const score = priorityScore(v);
      const bucket = priorityBucket(score);
      return Object.assign({}, v, { score, bucket, slaDays: remediationSLADays(bucket) });
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = { ASSET_WEIGHT, clamp, assetWeight, priorityScore, priorityBucket, remediationSLADays, prioritize };

