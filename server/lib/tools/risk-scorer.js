/**
 * Cybersecurity pack — built-in tool: risk-scorer (REAL scoring, not a mock).
 * Scores likelihood × impact and labels CVSS severity. Detection/scanning is a
 * separate, credential-gated adapter — this only triages, it does not detect.
 */
const risk = require('../packs/cybersecurity/risk');

module.exports = {
  name: 'risk-scorer',
  description: 'Scores risk (likelihood × impact → level) and labels a CVSS base score. Triage only — not detection.',
  inputs: ['likelihood', 'impact', 'cvss'],
  outputs: ['score', 'level', 'cvssSeverity'],
  async run(input, ctx) {
    const o = input || {};
    const score = risk.riskScore(o.likelihood, o.impact);
    return {
      score,
      level: risk.riskLevel(score),
      cvssSeverity: o.cvss === undefined ? null : risk.cvssSeverity(o.cvss),
    };
  },
};

