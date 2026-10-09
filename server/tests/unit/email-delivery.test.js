'use strict';

describe('transactional email delivery adapter', () => {
  const envelope = {
    to: 'ada@example.com', subject: 'Status', html: '<p>Ready</p>', text: 'Ready',
    replyTo: 'support@example.com', tags: ['lifecycle event', 'second/tag'], idempotencyKey: 'mail-1',
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
  });

  test('validates envelopes and uses the observable console fallback', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const email = require('../../lib/email');
    await expect(email.send()).rejects.toThrow('{ to, subject } required');
    await expect(email.send({ to: 'ada@example.com', subject: 'Empty' }))
      .rejects.toThrow('at least one of');
    await expect(email.send(envelope)).resolves.toEqual({ provider: 'console', id: null });
    expect(email.provider()).toBe('console');
    expect(email.isConfigured()).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('ada@example.com'));
    log.mockRestore();
  });

  test('renders and sends named templates and rejects unknown templates', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const email = require('../../lib/email');
    await expect(email.sendTemplate('welcome', 'ada@example.com', { name: 'Ada' }))
      .resolves.toEqual({ provider: 'console', id: null });
    await expect(email.sendTemplate('missing', 'ada@example.com', {})).rejects.toThrow('unknown template');
    email._reset();
    expect(email.provider()).toBe('console');
    log.mockRestore();
  });

  test('sends through Resend with sanitized unique tags', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key';
    const mockSend = jest.fn().mockResolvedValue({ data: { id: 'resend-id' } });
    jest.doMock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend } })) }), { virtual: true });
    const email = require('../../lib/email');
    await expect(email.send(envelope)).resolves.toEqual({ provider: 'resend', id: 'resend-id' });
    expect(email.isConfigured()).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: ['ada@example.com'], reply_to: 'support@example.com',
      tags: [
        { name: 'category', value: 'lifecycle_event' },
        { name: 'category_1', value: 'second_tag' },
      ],
      headers: { 'Idempotency-Key': 'mail-1' },
    }));
  });

  test('sends through SendGrid when Resend is not configured', async () => {
    process.env.SENDGRID_API_KEY = 'sendgrid-test-key';
    const mockSetApiKey = jest.fn();
    const mockSend = jest.fn().mockResolvedValue([{ headers: { 'x-message-id': 'sendgrid-id' } }]);
    jest.doMock('@sendgrid/mail', () => ({ setApiKey: mockSetApiKey, send: mockSend }), { virtual: true });
    const email = require('../../lib/email');
    await expect(email.send(envelope)).resolves.toEqual({ provider: 'sendgrid', id: 'sendgrid-id' });
    expect(mockSetApiKey).toHaveBeenCalledWith('sendgrid-test-key');
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ada@example.com', replyTo: 'support@example.com', categories: envelope.tags,
    }));
  });

  test('logs a recoverable envelope and rethrows provider failures', async () => {
    process.env.RESEND_API_KEY = 'resend-test-key';
    const mockSend = jest.fn().mockResolvedValue({ error: { message: 'provider rejected' } });
    jest.doMock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend } })) }), { virtual: true });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const email = require('../../lib/email');
    await expect(email.send(envelope)).rejects.toThrow('provider rejected');
    expect(error).toHaveBeenCalledWith('[email] send failed via', 'resend', '-', 'provider rejected');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('send_failed'));
    log.mockRestore(); error.mockRestore();
  });
});

