'use strict';

const { PassThrough } = require('stream');
const classifier = require('../../lib/eu-ai-act-classifier');
const annex = require('../../lib/annex-iv-generator');

const base = {
  description: 'An internal forecasting system for operational planning only.',
  sector: 'other', decisionImpact: 'operational_internal', dataSensitive: ['none'],
  scope: 'eu_only', providerRole: 'deployer',
};
const classify = overrides => classifier.classify({ ...base, ...overrides });

describe('EU AI Act deterministic classification', () => {
  test('rejects incomplete and invalid assessment inputs with actionable details', () => {
    expect(() => classifier.classify({ description: 'short', sector: 'invalid' })).toThrow('invalid_assessment_input');
    try { classifier.classify({ description: 'short', sector: 'invalid' }); } catch (error) {
      expect(error.code).toBe('invalid_assessment_input');
      expect(error.details).toEqual(expect.arrayContaining([
        expect.stringContaining('description'), expect.stringContaining('sector'),
      ]));
    }
  });

  test('short-circuits systems genuinely outside EU scope', () => {
    expect(classify({ scope: 'outside_eu' })).toMatchObject({ verdict: 'minimal', score: 5, deadline: null });
  });

  test.each([
    ['5(1)(a)', { description: 'Uses subliminal manipulative techniques to change user behaviour and decisions.' }],
    ['5(1)(b)', { description: 'Uses recommendations to target elderly vulnerable people.', dataSensitive: ['none'] }],
    ['5(1)(c)', { description: 'A public citizen social scoring and trustworthiness rating system.' }],
    ['5(1)(d)', { description: 'Predictive crime profiling only for patrol decisions.', sector: 'law_enforcement' }],
    ['5(1)(e)', { description: 'Scrapes facial images from CCTV to create a biometric database.' }],
    ['5(1)(f)', { description: 'Emotion recognition of employees during meetings.', sector: 'employment' }],
    ['5(1)(g)', { description: 'Infers sensitive categories from people.', dataSensitive: ['biometric', 'race'] }],
    ['5(1)(h)', { description: 'Live identification in a public street crowd.', dataSensitive: ['biometric'] }],
  ])('detects prohibited practice Article %s', (article, overrides) => {
    const verdict = classify(overrides);
    expect(verdict.verdict).toBe('prohibited');
    expect(verdict.articles.map(item => item.ref)).toContain(article);
    expect(verdict.score).toBe(100);
  });

  test.each([
    ['2', { description: 'Optimizes a regional electricity grid and water network.', sector: 'critical_infra' }],
    ['3(a)', { description: 'Ranks applicants for university admissions and enrolment.', sector: 'education', decisionImpact: 'decides_outcome' }],
    ['4(a)', { description: 'Screens resumes and selects candidates for hiring.', sector: 'employment', decisionImpact: 'decides_outcome' }],
    ['5(b)', { description: 'Credit scoring system that decides loan approval.', sector: 'finance', decisionImpact: 'decides_outcome' }],
    ['6', { description: 'Assists officers with evidence prioritisation.', sector: 'law_enforcement' }],
    ['7', { description: 'Assists border officers reviewing asylum applications.', sector: 'migration' }],
    ['8(a)', { description: 'Court judicial decision support and sentencing research.', sector: 'justice' }],
  ])('detects high-risk Annex III point %s', (point, overrides) => {
    const verdict = classify(overrides);
    expect(verdict.verdict).toBe('high');
    expect(verdict.annexPoints.map(item => item.ref)).toContain(point);
    expect(verdict.obligations).toHaveLength(classifier._internal.HIGH_RISK_OBLIGATIONS.length);
  });

  test('adds Article 50 transparency obligations and systemic GPAI signal', () => {
    const limited = classify({
      description: 'A conversational chatbot that generates synthetic text and deepfake video.',
      decisionImpact: 'generates_content',
    });
    expect(limited.verdict).toBe('limited');
    expect(limited.articles.map(item => item.ref)).toEqual(expect.arrayContaining(['50(1)', '50(2)', '50(4)']));
    expect(limited.isGPAI).toBe(false);

    const gpai = classify({
      description: 'A frontier general purpose LLM with systemic risk and 10^25 FLOP used for hiring.',
      sector: 'employment', decisionImpact: 'decides_outcome',
    });
    expect(gpai).toMatchObject({ verdict: 'high', isGPAI: true, systemicRisk: true });
  });

  test('returns minimal risk with voluntary guidance when no rule matches', () => {
    expect(classify({})).toMatchObject({ verdict: 'minimal', score: 10, deadline: null });
  });
});

describe('Annex IV technical-document generation', () => {
  const verdict = classify({
    description: 'Screens resumes and selects candidates for hiring decisions.',
    sector: 'employment', decisionImpact: 'decides_outcome',
  });
  const record = { id: 'system-1', ai_systemName: 'Candidate Review' };

  test('requires a source record and classification', () => {
    expect(() => annex.generateJson({ verdict })).toThrow('record is required');
    expect(() => annex.generateJson({ record })).toThrow('verdict is required');
  });

  test('auto-populates known facts and marks every missing Annex IV field', () => {
    const document = annex.generateJson({
      record, verdict,
      organisation: { name: 'Example Ltd', address: 'Brussels', contactEmail: 'compliance@example.test' },
      extras: { version: '1.2.3', humanOversightMeasures: 'A trained reviewer may reject every recommendation.' },
    });
    expect(document.documentType).toContain('Annex IV');
    expect(document.aiSystem).toMatchObject({ id: 'system-1', name: 'Candidate Review' });
    expect(document.classification.verdict).toBe('high');
    expect(document.completeness.filled).toBeGreaterThanOrEqual(4);
    expect(document.completeness.percentage).toBeGreaterThan(0);
    expect(document.sections).toHaveLength(annex.SECTIONS.length);
    const missing = document.sections.flatMap(section => section.fields).filter(field => field.missing);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every(field => field.placeholder.includes('TO BE COMPLETED'))).toBe(true);
  });

  test('emits a real PDF stream without fabricating missing content', async () => {
    const stream = new PassThrough();
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => stream.on('finish', resolve).on('error', reject));
    annex.generatePdf({ record, verdict, organisation: { name: 'Example Ltd' } }, stream);
    await finished;
    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

