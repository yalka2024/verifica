const risk = require('../../lib/packs/cybersecurity/risk');
const inc = require('../../lib/packs/cybersecurity/incidents');
const vulns = require('../../lib/packs/cybersecurity/vulnerabilities');

describe('cybersecurity pack — risk scoring', () => {
  test('likelihood × impact → level', () => {
    expect(risk.riskScore(4, 5)).toBe(20);
    expect(risk.riskLevel(20)).toBe('critical');
    expect(risk.riskLevel(risk.riskScore(2, 3))).toBe('medium'); // 6
    expect(risk.riskLevel(risk.riskScore(1, 2))).toBe('low');    // 2
  });
  test('CVSS severity labels', () => {
    expect(risk.cvssSeverity(9.5)).toBe('critical');
    expect(risk.cvssSeverity(7.2)).toBe('high');
    expect(risk.cvssSeverity(5.0)).toBe('medium');
    expect(risk.cvssSeverity(2.0)).toBe('low');
  });
});

describe('cybersecurity pack — incident lifecycle & SLA', () => {
  test('legal transitions', () => {
    expect(inc.canTransition('new', 'triaged')).toBe(true);
    expect(inc.transition('investigating', 'contained')).toBe('contained');
    expect(() => inc.transition('closed', 'new')).toThrow();
  });
  test('SLA breach from open time', () => {
    expect(inc.minutesOpen('2024-01-01T00:00:00Z', '2024-01-01T01:30:00Z')).toBe(90);
    expect(inc.slaBreached('2024-01-01T00:00:00Z', 60, '2024-01-01T02:00:00Z')).toBe(true);
    expect(inc.slaBreached('2024-01-01T00:00:00Z', 60, '2024-01-01T00:30:00Z')).toBe(false);
  });
});

describe('cybersecurity pack — vulnerability prioritization', () => {
  test('asset criticality weights', () => {
    expect(vulns.assetWeight('critical')).toBe(4);
    expect(vulns.assetWeight('unknown')).toBe(1);
  });
  test('priority score blends CVSS, EPSS, and asset criticality', () => {
    expect(vulns.priorityScore({ cvss: 10, epss: 1, assetCriticality: 'critical' })).toBe(40);
    expect(vulns.priorityScore({ cvss: 4, epss: 0, assetCriticality: 'medium' })).toBe(4);
  });
  test('buckets and remediation SLAs', () => {
    expect(vulns.priorityBucket(40)).toBe('P1');
    expect(vulns.priorityBucket(13.5)).toBe('P2');
    expect(vulns.priorityBucket(4)).toBe('P3');
    expect(vulns.priorityBucket(1)).toBe('P4');
    expect(vulns.remediationSLADays('P1')).toBe(7);
  });
  test('prioritize ranks worst-first and tags SLA', () => {
    const ranked = vulns.prioritize([
      { id: 'low', cvss: 2, epss: 0, assetCriticality: 'low' },
      { id: 'crit', cvss: 10, epss: 1, assetCriticality: 'critical' },
    ]);
    expect(ranked[0].id).toBe('crit');
    expect(ranked[0].bucket).toBe('P1');
    expect(ranked[0].slaDays).toBe(7);
    expect(vulns.prioritize([])).toEqual([]);
  });
});

