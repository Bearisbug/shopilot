// IP 白名单：支持 IPv4 地址与 CIDR，IPv6 只做整串比较。
import { isIPv6 } from "node:net";
function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function normalize(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function ipAllowed(ip: string, allowlist: string[]): boolean {
  const addr = normalize(ip);
  const n = v4ToInt(addr);
  return allowlist.some((entry) => {
    const [base, bitsRaw] = entry.trim().split("/");
    if (n === null) return normalize(base) === addr;
    const b = v4ToInt(base);
    if (b === null) return false;
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  });
}

export function validIpEntry(entry: string): boolean {
  const [base, bits] = entry.trim().split("/");
  if (v4ToInt(base) !== null) return bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= 32);
  return isIPv6(base) && bits === undefined;
}
