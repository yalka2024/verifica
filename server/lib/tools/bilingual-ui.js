/**
 * Tool / integration adapter: Bilingual UI
 * User interface supporting Spanish and English
 *
 * Generated for Verifica.
 *
 * This is a PORT with two adapters:
 *   • mockRun  — deterministic, clearly-labeled fake data so the platform runs
 *                end-to-end today. Every result is tagged `_mock: true`.
 *   • realRun  — YOUR real integration. Implement it, flip `realImplemented` to
 *                true, and switch this tool live with:  INTEGRATION_BILINGUAL_UI_MODE=live
 *
 * It NEVER silently returns fake data dressed as real: in live mode an
 * unimplemented realRun() THROWS, so nothing downstream mistakes a guess for truth.
 */
const NAME = "Bilingual UI";
const ENV_KEY = 'INTEGRATION_BILINGUAL_UI_MODE';
const safety = require('../safety');

// Flip to `true` once realRun() is a genuine integration.
const realImplemented = false;

function currentMode() {
  return (process.env[ENV_KEY] || 'mock').toLowerCase() === 'live' ? 'live' : 'mock';
}

// Three-state capability status: 'mock' | 'live' | 'unimplemented'.
function status() {
  if (currentMode() === 'mock') return 'mock';
  return realImplemented ? 'live' : 'unimplemented';
}

async function mockRun(input, ctx) {
  // Deterministic, obviously-fake placeholder. Shape it toward `outputs` so
  // screens/agents render — but it is NOT real data.
  return {
    _mock: true,
    tool: NAME,
    note: `mock data — implement realRun() and set ${ENV_KEY}=live to use the real ${NAME}`,
    input,
  };
}

async function realRun(input, ctx) {
  // TODO: implement the real Bilingual UI integration (call the real API / data source).
  // Until then, live mode refuses rather than fake it.
  const err = new Error(`${NAME}: real integration not implemented — set ${ENV_KEY}=mock for demo data, or implement realRun().`);
  err.code = 'integration_unimplemented';
  err.statusCode = 501;
  throw err;
}

module.exports = {
  name: NAME,
  description: "User interface supporting Spanish and English",
  inputs: [],
  outputs: [],
  envKey: ENV_KEY,
  configKeys: [ENV_KEY],
  realImplemented,
  mode: currentMode,
  status,

  /**
   * @param {object} input  keyed by the declared input names
   * @param {object} ctx    { userId, orgId, modelId }
   * @returns {Promise<object>}
   */
  async run(input, ctx) {
    if (currentMode() === 'live') {
      safety.assertLiveAllowed(NAME);   // hard-block live mode on safety-gated platforms
      return realRun(input, ctx);
    }
    return mockRun(input, ctx);
  },
};

