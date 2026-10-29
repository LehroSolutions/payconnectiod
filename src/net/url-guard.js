import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function parseIpv4(value) {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

function inIpv4Range(address, cidr) {
  const [base, prefix] = cidr.split('/');
  const baseValue = parseIpv4(base);
  const addressValue = parseIpv4(address);
  if (baseValue === null || addressValue === null) return false;
  const bits = Number(prefix);
  if (baseValue === 0) return addressValue === 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (addressValue & mask) === (baseValue & mask);
}

const BLOCKED_IPV4_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

function expandIpv6(value) {
  let address = value.toLowerCase();
  const zoneIndex = address.indexOf('%');
  if (zoneIndex !== -1) address = address.slice(0, zoneIndex);

  const embeddedIpv4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (embeddedIpv4) {
    const mapped = parseIpv4(embeddedIpv4[1]);
    if (mapped === null) return null;
    const high = ((mapped >>> 16) & 0xffff).toString(16);
    const low = (mapped & 0xffff).toString(16);
    address = address.slice(0, embeddedIpv4.index) + `${high}:${low}`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array.from({ length: Math.max(missing, 0) }, () => '0'), ...tail];
  if (groups.length !== 8) return null;
  const parsed = groups.map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : null,
  );
  return parsed.some((group) => group === null) ? null : parsed;
}

function isPrivateIpv6(value) {
  const groups = expandIpv6(value);
  if (!groups) return true;

  const isZeroPrefix = groups.slice(0, 7).every((group) => group === 0);
  if (isZeroPrefix && (groups[7] === 0 || groups[7] === 1)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) return true;

  const embeddedIpv4 = `${groups[6] >>> 8}.${groups[6] & 0xff}.${groups[7] >>> 8}.${groups[7] & 0xff}`;
  return isPrivateIpv4(embeddedIpv4);
}

function isPrivateIpv4(value) {
  return BLOCKED_IPV4_RANGES.some((cidr) => inIpv4Range(value, cidr));
}

export function isPrivateAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function assertSafeProtocol(url) {
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return `Unsupported protocol '${url.protocol.replace(':', '')}'. Use http or https.`;
  }
  if (url.username || url.password) {
    return 'URL must not embed credentials.';
  }
  return null;
}

export function parseWebhookUrl(rawUrl) {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'A delivery URL is required.' };

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'Delivery URL must be a valid absolute http(s) URL.' };
  }

  const protocolError = assertSafeProtocol(url);
  if (protocolError) return { ok: false, reason: protocolError };

  if (!url.hostname) return { ok: false, reason: 'Delivery URL must include a hostname.' };
  return { ok: true, url };
}

export async function assertSafeWebhookTarget(rawUrl, { allowPrivateTargets = false } = {}) {
  const parsed = parseWebhookUrl(rawUrl);
  if (!parsed.ok) return parsed;
  if (allowPrivateTargets) return parsed;

  const { url } = parsed;
  const literalFamily = isIP(url.hostname);
  if (literalFamily) {
    if (isPrivateAddress(url.hostname)) {
      return { ok: false, reason: `Delivery URL resolves to a private address (${url.hostname}).` };
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: `Delivery URL hostname '${url.hostname}' could not be resolved.` };
  }

  if (addresses.length === 0) {
    return {
      ok: false,
      reason: `Delivery URL hostname '${url.hostname}' did not resolve to any address.`,
    };
  }

  const blocked = addresses.filter((entry) => isPrivateAddress(entry.address));
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: `Delivery URL resolves to a private address (${blocked.map((entry) => entry.address).join(', ')}).`,
    };
  }

  return parsed;
}
