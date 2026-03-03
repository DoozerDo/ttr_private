import {
  buildConfirmationUrl,
  resolvePublicWebBaseUrl,
} from './confirm-url';

describe('confirm-url', () => {
  it('handles trailing slash and builds the expected confirm URL', () => {
    const baseUrl = resolvePublicWebBaseUrl({
      nodeEnv: 'production',
      appPublicWebUrl: 'https://targetthisrole.com/',
    });

    const url = buildConfirmationUrl(baseUrl, 'abc123');

    expect(url).toEqual('https://targetthisrole.com/auth/confirm?token=abc123');
  });

  it('builds a correct confirm URL without a trailing slash', () => {
    const baseUrl = resolvePublicWebBaseUrl({
      nodeEnv: 'production',
      appPublicWebUrl: 'https://targetthisrole.com',
    });

    const url = buildConfirmationUrl(baseUrl, 'token-value');

    expect(url).toEqual(
      'https://targetthisrole.com/auth/confirm?token=token-value',
    );
  });

  it('throws when APP_PUBLIC_WEB_URL is missing outside development', () => {
    expect(() =>
      resolvePublicWebBaseUrl({
        nodeEnv: 'production',
        appPublicWebUrl: undefined,
      }),
    ).toThrow('Missing APP_PUBLIC_WEB_URL environment variable');
  });
});
