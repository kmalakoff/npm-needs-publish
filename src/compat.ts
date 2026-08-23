// Feature-detected fallbacks for APIs missing on the oldest supported Node.

import urlModule from 'url';

export interface ParsedUrl {
  protocol: string | null;
  hostname: string | null;
  port: string | null;
  path: string | null;
}

// WHATWG URL is global from Node 10; below that only url.parse exists, above it
// url.parse emits DEP0169.
const hasWhatwgUrl = typeof URL === 'function';

export function parseUrl(target: string): ParsedUrl {
  if (hasWhatwgUrl) {
    const parsed = new URL(target);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || null,
      path: `${parsed.pathname}${parsed.search}`,
    };
  }
  const parsed = urlModule.parse(target);
  return {
    protocol: parsed.protocol || null,
    hostname: parsed.hostname || null,
    port: parsed.port || null,
    path: parsed.path || null,
  };
}

export function resolveUrl(base: string, target: string): string {
  if (hasWhatwgUrl) return new URL(target, base).href;
  return urlModule.resolve(base, target);
}
