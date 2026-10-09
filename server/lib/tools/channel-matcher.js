/** Channel Matcher — compares the phone number someone gave you with the
 * number DOJ has on file for the organization they claim to represent, and
 * reports which listed organizations (if any) actually use that number. */
'use strict';
const roster = require('../verifica/roster');

module.exports = {
  name: 'Channel Matcher',
  description: 'Tool to match contact channels with official records',
  inputs: ['organization', 'phone'],
  outputs: ['matches_official_record', 'official_phones', 'number_listed_for'],
  realImplemented: true,
  mode: () => 'live',
  status: () => 'live',
  async run(input = {}) {
    const r = roster.findOrganization(String(input.organization || ''), String(input.phone || ''));
    return {
      organization_listed: r.status === 'listed',
      matches_official_record: r.phone ? r.phone.on_file_for_name : null,
      official_phones: (r.matches || []).map((m) => ({ office: m.office, city: m.city, state: m.state, phone: m.phone })),
      number_listed_for: r.phone ? r.phone.listed_for : [],
    };
  },
};
