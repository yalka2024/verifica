/**
 * Cybersecurity pack — built-in tool: vuln-prioritizer (REAL triage math, not a mock).
 * Auto-discovered by the tool registry; ranks a vulnerability set by CVSS + EPSS +
 * asset criticality into P1-P4 buckets with remediation SLAs.
 */
const vulns = require('../packs/cybersecurity/vulnerabilities');

module.exports = {
  name: 'vuln-prioritizer',
  description: 'Ranks vulnerabilities worst-first by CVSS base score, EPSS exploit probability, and asset criticality; tags each with a P1-P4 bucket and remediation SLA.',
  inputs: ['vulnerabilities'],
  outputs: ['ranked'],
  async run(input, ctx) {
    const list = (input && input.vulnerabilities) || [];
    return { ranked: vulns.prioritize(list) };
  },
};

