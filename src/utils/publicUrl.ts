import dns from "node:dns/promises";
import { BlockList } from "node:net";

const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(network, prefix, "ipv6");
}

export const publicHttpsUrlProblem = async (raw: string): Promise<string | null> => {
  if (!URL.canParse(raw)) return "Enter a valid URL";

  const url = new URL(raw);
  if (url.protocol !== "https:") return "The URL must use https";
  if (url.username || url.password) return "The URL must not contain a username or password";

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(host, { all: true }).catch(() => null);
  if (!addresses) return `Could not find the host ${host}`;

  const isPublic = addresses.every(({ address, family }) => !NON_PUBLIC.check(address, family === 6 ? "ipv6" : "ipv4"));
  return isPublic ? null : `${host} is not a public address, so we can't reach it`;
};
