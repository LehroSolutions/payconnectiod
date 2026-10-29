import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateAddress,
  parseWebhookUrl,
  assertSafeWebhookTarget,
} from '../src/net/url-guard.js';

test('rejects non-http delivery schemes', () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://internal.example.com/x',
    'gopher://127.0.0.1:6379/_INFO',
    'data:text/plain,hello',
  ]) {
    const parsed = parseWebhookUrl(url);
    assert.equal(parsed.ok, false, `${url} should be rejected`);
    assert.match(parsed.reason, /protocol|valid absolute/i);
  }
});

test('rejects malformed and relative delivery URLs', () => {
  for (const url of ['', '   ', 'not-a-url', '/relative/hook', '//example.com/hook']) {
    assert.equal(parseWebhookUrl(url).ok, false, `${url} should be rejected`);
  }
});

test('rejects URLs that embed credentials', () => {
  const parsed = parseWebhookUrl('https://user:pass@example.com/hook');
  assert.equal(parsed.ok, false);
  assert.match(parsed.reason, /credentials/i);
});

test('classifies private and reserved addresses', () => {
  const privateAddresses = [
    '127.0.0.1',
    '127.5.5.5',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.5.4',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ];
  for (const address of privateAddresses) {
    assert.equal(isPrivateAddress(address), true, `${address} should be private`);
  }

  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111']) {
    assert.equal(isPrivateAddress(address), false, `${address} should be public`);
  }
});

test('blocks cloud metadata and loopback delivery targets by default', async () => {
  for (const url of [
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://127.0.0.1:9000/internal',
    'http://localhost:5432/',
    'http://[::1]:8080/',
    'http://192.168.0.1/admin',
  ]) {
    const result = await assertSafeWebhookTarget(url, { allowPrivateTargets: false });
    assert.equal(result.ok, false, `${url} must be blocked`);
    assert.match(result.reason, /private address|could not be resolved/i);
  }
});

test('allows private targets only when explicitly opted in', async () => {
  const blocked = await assertSafeWebhookTarget('http://127.0.0.1:9000/internal', {
    allowPrivateTargets: false,
  });
  assert.equal(blocked.ok, false);

  const allowed = await assertSafeWebhookTarget('http://127.0.0.1:9000/internal', {
    allowPrivateTargets: true,
  });
  assert.equal(allowed.ok, true);
});

test('keeps public https targets reachable', async () => {
  const result = await assertSafeWebhookTarget('https://example.com/hooks/payconnectoid', {
    allowPrivateTargets: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.url.hostname, 'example.com');
});
