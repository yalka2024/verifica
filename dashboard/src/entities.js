/**
 * Spec-driven domain entities for Verifica (Phase 6 — domain admin UI).
 *
 * Same manifest the server's routes/entities.js exposes. The Data page renders a
 * real list / create / edit / delete UI over each, wired to /api/<plural>.
 * [] when the spec declared no entities.
 */
export const ENTITIES = [{"model":"attorney","plural":"attorneies","fields":["name","bar_number","state"],"fieldTypes":{"name":"String","bar_number":"String","state":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"dOJAccreditedRepresentative","plural":"dOJAccreditedRepresentatives","fields":["name","accreditation_expiration","organization"],"fieldTypes":{"name":"String","accreditation_expiration":"DateTime","organization":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"notario","plural":"notarios","fields":["name","advertising_language"],"fieldTypes":{"name":"String","advertising_language":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"governmentAgency","plural":"governmentAgencies","fields":["name","official_channels"],"fieldTypes":{"name":"String","official_channels":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}},{"model":"immigrationOrganization","plural":"immigrationOrganizations","fields":["name","recognition_expiration","address"],"fieldTypes":{"name":"String","recognition_expiration":"DateTime","address":"String"},"computed":[],"writableBy":{},"anonymous":false,"readableBy":[],"rowScope":{}}];

