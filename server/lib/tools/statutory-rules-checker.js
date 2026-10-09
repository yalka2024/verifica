/** Statutory Rules Checker — applies the fixed USCIS/EOIR fraud red-flag
 * rules to a message, after AI claim extraction. Deterministic verdict. */
'use strict';
const { verify } = require('../verifica/verify');

module.exports = {
  name: 'Statutory Rules Checker',
  description: 'Tool to apply statutory rules for verification',
  inputs: ['text', 'lang'],
  outputs: ['risk', 'score', 'findings'],
  realImplemented: true,
  mode: () => 'live',
  status: () => 'live',
  async run(input = {}) {
    const r = await verify({ text: String(input.text || ''), lang: input.lang });
    return { risk: r.risk, score: r.score, findings: r.findings, extraction: r.extraction };
  },
};
