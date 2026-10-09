'use strict';

const { assertPublicUrl } = require('../../lib/webhook-delivery');

describe('webhook SSRF boundary', () => {
  test.each([
    'http://127.0.0.1/hook',
    'http://10.2.3.4/hook',
    'http://172.16.0.1/hook',
    'http://192.168.1.2/hook',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1/hook',
    'http://[::1]/hook',
    'http://[::ffff:127.0.0.1]/hook',
    'http://localhost/hook',
    'http://service.internal/hook',
  ])('rejects private or local target %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(/private address/);
  });

  test('rejects non-HTTP protocols', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/http\(s\)/);
  });

  test('returns a connection-pinned public IP literal', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/hook')).resolves.toMatchObject({
      address: '8.8.8.8',
      family: 4,
    });
  });
});

