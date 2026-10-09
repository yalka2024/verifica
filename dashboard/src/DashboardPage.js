import React, { useState, useEffect, useCallback } from 'react';
import { getRecords, getRecord, uploadFile, deleteRecord, getAnalytics } from './api';
import VerdictCard from './VerdictCard';
import ConformityCard from './ConformityCard';
import EvaluationsCard from './EvaluationsCard';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';

export default function DashboardPage() {
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState('list');

  const loadRecords = useCallback(async () => {
    try {
      const data = await getRecords();
      setRecords(data.verifications || []);
    } catch {}
  }, []);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file);
      await loadRecords();
    } catch (err) {
      alert(err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    await deleteRecord(id);
    setSelected(null);
    loadRecords();
  };

  const viewRecord = async (id) => {
    const data = await getRecord(id);
    setSelected(data);
    setView('detail');
  };

  const loadAnalytics = async () => {
    const data = await getAnalytics();
    setAnalytics(data);
    setView('analytics');
  };

  const getRiskColor = (risk) => {
    const colors = { Low: '#4caf50', Moderate: '#ff9800', High: '#f44336', Critical: '#9c27b0' };
    return colors[risk] || '#888';
  };

  if (view === 'detail' && selected) {
    const report = selected.reportJson ? JSON.parse(selected.reportJson) : null;
    return (
      <div className="p-8">
        <Button variant="outline" className="mb-4" onClick={() => { setView('list'); setSelected(null); }}>← Back</Button>
        <h2 className="mb-3 text-2xl font-semibold text-foreground">{selected.verificationName}</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          <span className={'rounded-full px-3 py-1 text-sm ' + (selected.status === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400')}>{selected.status}</span>
          {selected.overallRisk && <span className="rounded-full bg-muted px-3 py-1 text-sm" style={{ color: getRiskColor(selected.overallRisk) }}>{selected.overallRisk} Risk — Score: {selected.riskScore}</span>}
        </div>

        <VerdictCard record={selected} recordId={selected.id} onUpdated={(updated) => setSelected({ ...selected, ...updated })} />
        {(selected.overallRisk === 'high' || selected.overallRisk === 'limited') && (
          <>
            <ConformityCard recordId={selected.id} />
            <EvaluationsCard record={selected} />
          </>
        )}
        {report && (
          <div className="space-y-4">
            {report.findings && Object.keys(report.findings).length > 0 && (
              <Card>
                <CardHeader><CardTitle>Findings ({Object.keys(report.findings).length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(report.findings).map(([key, val]) => (
                    <div key={key} className="border-b border-border pb-2">
                      <strong className="text-primary">{key.replace(/_/g, ' ')}</strong>
                      <p className="text-sm text-muted-foreground">{String(val).slice(0, 300)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {report.gaps && report.gaps.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Gaps ({report.gaps.length})</CardTitle></CardHeader>
                <CardContent>
                  {report.gaps.map((gap, i) => (
                    <div key={i} className="py-1 text-red-400">⚠ {gap.replace(/_/g, ' ')}</div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
        <Button variant="outline" className="mt-4 border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={() => handleDelete(selected.id)}>Delete</Button>
      </div>
    );
  }

  if (view === 'analytics' && analytics) {
    const cards = [
      ['Total', analytics.total, 'text-primary'],
      ['Completed', analytics.completed, 'text-green-400'],
      ['Failed', analytics.failed, 'text-red-400'],
      ['Last 30 Days', analytics.last30Days, 'text-orange-400'],
    ];
    return (
      <div className="p-8">
        <Button variant="outline" className="mb-4" onClick={() => setView('list')}>← Back</Button>
        <h2 className="mb-4 text-2xl font-semibold text-foreground">Analytics</h2>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {cards.map(([label, val, cls]) => (
            <Card key={label}>
              <CardContent className="p-6 text-center">
                <div className={'text-3xl font-bold ' + cls}>{val}</div>
                <div className="text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        {analytics.riskDistribution && (
          <Card className="mt-4">
            <CardHeader><CardTitle>Risk Distribution</CardTitle></CardHeader>
            <CardContent>
              {Object.entries(analytics.riskDistribution).map(([level, count]) => (
                <div key={level} className="flex justify-between py-1">
                  <span style={{ color: getRiskColor(level) }}>{level}</span>
                  <span className="text-foreground">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Verifications</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAnalytics}>Analytics</Button>
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            {uploading ? 'Uploading...' : '+ New'}
            <input type="file" accept=".txt,.pdf,.docx" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-lg">No records yet</p>
          <p>Upload a file to get started.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-sm text-muted-foreground">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Risk</th>
                  <th className="p-3 font-medium">Score</th>
                  <th className="p-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} onClick={() => viewRecord(r.id)} className="cursor-pointer border-b border-border/50 hover:bg-accent/50">
                    <td className="p-3 text-foreground">{r.verificationName}</td>
                    <td className="p-3"><span style={{ color: r.status === 'completed' ? '#4caf50' : r.status === 'failed' ? '#f44336' : '#ff9800' }}>{r.status}</span></td>
                    <td className="p-3"><span style={{ color: getRiskColor(r.overallRisk) }}>{r.overallRisk || '—'}</span></td>
                    <td className="p-3 text-foreground">{r.riskScore ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

