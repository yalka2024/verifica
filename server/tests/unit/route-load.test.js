'use strict';

const fs = require('fs');
const path = require('path');

describe('every emitted API route is loadable', () => {
  const routeDir = path.resolve(__dirname, '../../routes');
  const routeFiles = fs.readdirSync(routeDir).filter(name => name.endsWith('.js')).sort();

  test('the generated platform has a non-empty route surface', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  test.each(routeFiles)('%s loads and exports an Express router', routeFile => {
    const exported = require(path.join(routeDir, routeFile));
    const routes = typeof exported === 'function' ? [exported] : Object.values(exported);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(typeof route).toBe('function');
      expect(Array.isArray(route.stack)).toBe(true);
    }
  });
});

