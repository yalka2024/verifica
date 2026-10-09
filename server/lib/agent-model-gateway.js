'use strict';
const modelRouter = require('./model-router');

function configuredProviders() {
  const out = [];
  if (process.env.OPENAI_API_KEY) out.push('openai');
  if (process.env.ANTHROPIC_API_KEY) out.push('anthropic');
  if (process.env.GEMINI_API_KEY) out.push('gemini');
  if (process.env.OLLAMA_BASE_URL) out.push('ollama');
  return out;
}

function choose({ model, difficulty, planId, budgetUtilization }) {
  const providers = configuredProviders();
  if (!providers.length) { const e = new Error('No AI provider configured'); e.code = 'ai_unconfigured'; throw e; }
  if (model) {
    const entry = modelRouter.REGISTRY[model];
    if (!entry || !providers.includes(entry.provider)) { const e = new Error('Requested model is unavailable'); e.code = 'model_unavailable'; throw e; }
    return { modelId: model, provider: entry.provider, reason: 'hint' };
  }
  const picks = providers.filter((provider) => provider !== 'ollama')
    .map((provider) => modelRouter.pickModel({ providerHint: provider, planId, budgetUtilization, difficulty }))
    .filter((p) => p && p.model && p.model.provider !== 'mock');
  if (providers.includes('ollama')) picks.push({ modelId: process.env.OLLAMA_MODEL || 'llama3.1', model: { provider: 'ollama', quality: 1 }, price: { inUsdPerM: 0, outUsdPerM: 0 } });
  if (!picks.length) { const e = new Error('No eligible configured model'); e.code = 'model_unavailable'; throw e; }
  const strategy = modelRouter.strategy();
  picks.sort((a, b) => strategy === 'best'
    ? b.model.quality - a.model.quality
    : (a.price.inUsdPerM + a.price.outUsdPerM) - (b.price.inUsdPerM + b.price.outUsdPerM));
  const pick = picks[0];
  return { modelId: pick.modelId, provider: pick.model.provider, reason: `cross-provider:${strategy}` };
}

async function complete({ prompt, system, model, difficulty, planId, budgetUtilization }) {
  const selected = choose({ model, difficulty, planId, budgetUtilization });
  if (selected.provider === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    const response = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({
      model: selected.modelId, max_tokens: 2000, system: system || '', messages: [{ role: 'user', content: prompt }],
    });
    return { text: (response.content.find((b) => b.type === 'text') || {}).text || '', ...selected,
      promptTokens: response.usage?.input_tokens || 0, completionTokens: response.usage?.output_tokens || 0 };
  }
  const OpenAI = require('openai');
  let client;
  if (selected.provider === 'gemini') client = new OpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: process.env.GEMINI_API_KEY });
  else if (selected.provider === 'ollama') client = new OpenAI({ baseURL: `${process.env.OLLAMA_BASE_URL.replace(/\/$/, '')}/v1`, apiKey: 'ollama' });
  else client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: selected.modelId, max_tokens: 2000,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
  });
  return { text: response.choices[0]?.message?.content || '', ...selected,
    promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0 };
}

module.exports = { configuredProviders, choose, complete };

