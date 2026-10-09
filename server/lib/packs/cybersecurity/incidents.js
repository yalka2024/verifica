/**
 * Cybersecurity pack — incident lifecycle + SLA (real domain logic).
 * Enforces legal incident transitions and computes SLA breach from open time.
 */
'use strict';

const TRANSITIONS = {
  new:           ['triaged', 'closed'],
  triaged:       ['investigating', 'closed'],
  investigating: ['contained', 'closed'],
  contained:     ['resolved', 'investigating'],
  resolved:      ['closed', 'investigating'],
  closed:        [],
};

function nextStates(from) { return TRANSITIONS[from] ? TRANSITIONS[from].slice() : []; }
function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }
function transition(from, to) {
  if (!canTransition(from, to)) {
    const e = new Error(`invalid incident transition: ${from} -> ${to}`);
    e.code = 'invalid_transition';
    throw e;
  }
  return to;
}

function minutesOpen(openedAt, asOf) {
  const s = new Date(openedAt);
  if (isNaN(s.getTime())) return 0;
  return Math.round(((new Date(asOf || Date.now())) - s) / 60000);
}

function slaBreached(openedAt, slaMinutes, asOf) {
  const s = new Date(openedAt);
  if (isNaN(s.getTime())) return false;
  return minutesOpen(openedAt, asOf) > (Number(slaMinutes) || 0);
}

module.exports = { TRANSITIONS, nextStates, canTransition, transition, minutesOpen, slaBreached };

