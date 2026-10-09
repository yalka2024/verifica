/** DOJ Roster Checker — looks a person or organization up on the official
 * DOJ EOIR Recognition & Accreditation roster (server/data/eoir-roster.json).
 * Local official data: no external call, so it is always live. */
'use strict';
const roster = require('../verifica/roster');

module.exports = {
  name: 'DOJ Roster Checker',
  description: 'Tool to verify against DOJ EOIR roster',
  inputs: ['name', 'organization', 'phone'],
  outputs: ['person', 'organization', 'roster'],
  realImplemented: true,
  mode: () => 'live',
  status: () => 'live',
  async run(input = {}) {
    return {
      person: input.name ? roster.findRepresentative(String(input.name)) : { status: 'not_provided' },
      organization: input.organization || input.phone ? roster.findOrganization(String(input.organization || ''), String(input.phone || '')) : { status: 'not_provided' },
      roster: roster.meta(),
    };
  },
};
