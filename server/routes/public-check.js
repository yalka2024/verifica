'use strict';
/**
 * POST /api/public/check — the public "verify before you pay" endpoint.
 *
 * No account required (the people who need this most will not sign up for
 * one) and nothing the person pastes is stored or logged: the message goes to
 * the AI extractor and back. Rate-limited per IP like other AI routes.
 */
const express = require('express');
const limiters = require('../lib/ratelimit');
const { asyncHandler } = require('../lib/validate');
const { verify } = require('../lib/verifica/verify');
const roster = require('../lib/verifica/roster');

const router = express.Router();

router.get('/roster', (req, res) => {
  const { reps, orgs, meta } = roster.load();
  res.json({ ...meta, representatives: reps.length, organizations: orgs.length });
});

router.post('/', limiters.ai, express.json({ limit: '32kb' }), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const fields = ['text', 'name', 'organization', 'phone'].reduce((o, k) => ({ ...o, [k]: typeof b[k] === 'string' ? b[k] : '' }), {});
  if (!Object.values(fields).some((v) => v.trim())) {
    return res.status(400).json({ error: 'Paste the message or enter a name, organization, or phone number.', code: 'empty' });
  }
  const result = await verify({ ...fields, lang: b.lang });
  res.set('Cache-Control', 'no-store');
  res.json(result);
}));

module.exports = router;
