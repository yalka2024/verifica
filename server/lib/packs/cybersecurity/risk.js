/**
 * Cybersecurity pack — risk scoring (real, validated domain logic).
 *
 * Assembled into Verifica because it targets cybersecurity / SOC.
 * This is the SOC WORKFLOW layer (scoring/triage). Actual threat DETECTION,
 * scanning, and intel require licensed feeds / real scanners — wire a
 * credential-gated adapter; do NOT fake detection here (a hollow security tool
 * gives false confidence). See OPERATION-PLAN.md.
 */
'use strict';

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }

// Likelihood (0..5) × Impact (0..5) → 0..25.
function riskScore(likelihood, impact) {
  return clamp(likelihood, 0, 5) * clamp(impact, 0, 5);
}

function riskLevel(score) {
  const s = Number(score) || 0;
  if (s >= 20) return 'critical';
  if (s >= 12) return 'high';
  if (s >= 6) return 'medium';
  if (s >= 1) return 'low';
  return 'none';
}

// CVSS base score (0..10) → severity label.
function cvssSeverity(score) {
  const s = Number(score) || 0;
  if (s >= 9.0) return 'critical';
  if (s >= 7.0) return 'high';
  if (s >= 4.0) return 'medium';
  if (s >= 0.1) return 'low';
  return 'none';
}

module.exports = { clamp, riskScore, riskLevel, cvssSeverity };

