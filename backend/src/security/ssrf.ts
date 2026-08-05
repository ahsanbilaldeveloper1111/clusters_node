/**
 * SSRF protection — block webhooks / fetches to private, link-local, and metadata IPs.
 * Critical when user/admin-controlled URLs are fetched server-side.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const ranges: [number, number][] = [
    [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
    [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
    [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
    [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')], // link-local + cloud metadata
    [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
    [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
    [ipv4ToInt('224.0.0.0'), ipv4ToInt('255.255.255.255')],
  ];
  return ranges.some(([a, b]) => n >= a && n <= b);
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80') ||
    lower === '::'
  );
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https allowed');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are blocked');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error(`Blocked destination IP: ${host}`);
    return;
  }

  const records = await lookup(host, { all: true });
  if (!records.length) throw new Error('DNS lookup failed');
  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      throw new Error(`Blocked resolved IP for ${host}: ${rec.address}`);
    }
  }
}
