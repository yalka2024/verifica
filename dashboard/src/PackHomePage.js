import React, { useState } from 'react';
import { apiJson } from './api';

// Triage board — drives the cybersecurity pack's vuln-prioritizer tool: enter a
// vulnerability dump (CVSS, EPSS, asset criticality), get a worst-first P1-P4
// board with remediation SLAs.
const BLANK = { name: '', cvss: 5, epss: 0.1, assetCriticality: 'medium' };
const BUCKET_COLOR = { P1: '#c0392b', P2: '#e67e22', P3: '#f1c40f', P4: '#7f8c8d' };

export default function PackHomePage() {
  const [rows, setRows] = useState([{ ...BLANK }]);
  const [ranked, setRanked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  async function prioritize() {
    setBusy(true);
    setError(null);
    try {
      const d = await apiJson('/tools/vuln-prioritizer/run', {
        method: 'POST',
        body: JSON.stringify({
          vulnerabilities: rows.filter((r) => r.name).map((r) => ({
            name: r.name,
            cvss: Number(r.cvss),
            epss: Number(r.epss),
            assetCriticality: r.assetCriticality,
          })),
        }),
      });
      setRanked(d.result && d.result.ranked ? d.result.ranked : []);
    } catch (e) {
      setError('Could not prioritize the vulnerabilities.');
    } finally {
      setBusy(false);
    }
  }

  const buckets = ['P1', 'P2', 'P3', 'P4'];

  return (
    <div className="page">
      <h1>Triage board</h1>
      <p className="subtitle">CVSS × EPSS × asset criticality, ranked worst-first with a remediation SLA.</p>
      <table style={ { width: '100%', borderCollapse: 'collapse' } }>
        <thead>
          <tr><th align="left">Vulnerability</th><th align="left">CVSS (0-10)</th><th align="left">EPSS (0-1)</th><th align="left">Asset criticality</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder="CVE / finding" /></td>
              <td><input type="number" min="0" max="10" step="0.1" style={ { width: 70 } } value={r.cvss} onChange={(e) => set(i, 'cvss', e.target.value)} /></td>
              <td><input type="number" min="0" max="1" step="0.01" style={ { width: 70 } } value={r.epss} onChange={(e) => set(i, 'epss', e.target.value)} /></td>
              <td>
                <select value={r.assetCriticality} onChange={(e) => set(i, 'assetCriticality', e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={ { marginTop: 10, display: 'flex', gap: 8 } }>
        <button onClick={() => setRows((r) => [...r, { ...BLANK }])}>Add finding</button>
        <button className="primary" onClick={prioritize} disabled={busy}>Prioritize</button>
      </div>
      {error && <p style={ { color: '#c0392b' } }>{error}</p>}
      {ranked && (
        <div style={ { marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' } }>
          {buckets.map((b) => (
            <div key={b} style={ { flex: '1 1 200px', minWidth: 200 } }>
              <h3 style={ { color: BUCKET_COLOR[b] } }>{b} <span style={ { fontSize: 12, opacity: 0.7 } }>({ranked.filter((v) => v.bucket === b).length})</span></h3>
              <ul className="list">
                {ranked.filter((v) => v.bucket === b).map((v, i) => (
                  <li key={i} style={ { margin: '6px 0' } }>
                    <strong>{v.name}</strong> — score {v.score}
                    <div style={ { fontSize: 12, opacity: 0.8 } }>SLA: {v.slaDays}d</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

