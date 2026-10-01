import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain"]);

export async function validateReachableSiteUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a complete URL, including https://"); }
  if (url.username || url.password) throw new Error("URLs containing usernames or passwords are not allowed.");
  if (url.protocol !== "https:") throw new Error("Staging URLs must use HTTPS.");
  if (url.port && url.port !== "443") throw new Error("Custom URL ports are not supported.");
  url.hash = "";
  await assertPublicHost(url.hostname);

  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHost(current.hostname);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "QAWELL-Site-Check/1.0" },
      });
    } catch { throw new Error("QAWELL could not reach that URL."); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The site returned an invalid redirect.");
      current = new URL(location, current);
      if (current.protocol !== "https:") throw new Error("The site redirects away from HTTPS.");
      continue;
    }
    if (response.status >= 500) throw new Error(`The site responded with ${response.status}. Try again when it is available.`);
    return { enteredUrl: url.toString(), origin: url.origin, checkedUrl: current.toString(), status: response.status };
  }
  throw new Error("The site redirects too many times.");
}

async function assertPublicHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(normalized) || normalized.endsWith(".local") || normalized.endsWith(".internal")) {
    throw new Error("Local and private-network URLs are not allowed.");
  }
  let addresses;
  try { addresses = await lookup(normalized, { all: true, verbatim: true }); }
  catch { throw new Error("That hostname does not resolve in public DNS."); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("That hostname resolves to a private or reserved network.");
  }
}

function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  if (family === 6) {
    const value = address.toLowerCase();
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("2001:db8:") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
  }
  return true;
}
