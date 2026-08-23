import http from 'http';
import https from 'https';
import { parseUrl, resolveUrl } from '../compat.ts';

export interface RequestError extends Error {
  code?: string;
  statusCode?: number;
}

export type RequestCallback = (error: RequestError | null, body?: Buffer) => void;

const MAX_REDIRECTS = 5;

// GETs a URL, following redirects, buffering the whole response.
export function request(target: string, headers: Record<string, string>, callback: RequestCallback): void {
  get(target, headers, MAX_REDIRECTS, callback);
}

function get(target: string, headers: Record<string, string>, redirectsLeft: number, callback: RequestCallback): void {
  const parsed = parseUrl(target);
  const transport = parsed.protocol === 'http:' ? http : https;

  let settled = false;
  function done(error: RequestError | null, body?: Buffer): void {
    if (settled) return;
    settled = true;
    callback(error, body);
  }

  let req: http.ClientRequest;
  try {
    req = transport.get(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: headers,
      },
      (res) => {
        const statusCode = res.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            const error = new Error(`Too many redirects fetching ${target}`) as RequestError;
            error.code = 'EREDIRECTS';
            return done(error);
          }
          return get(resolveUrl(target, res.headers.location as string), headers, redirectsLeft - 1, done);
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', (error: Error) => done(error as RequestError));
        res.on('end', () => {
          if (statusCode >= 400) {
            const error = new Error(`Registry responded ${statusCode} for ${target}`) as RequestError;
            // E404 is load-bearing: it is how a first publish is detected.
            error.code = statusCode === 404 ? 'E404' : `E${statusCode}`;
            error.statusCode = statusCode;
            return done(error);
          }
          done(null, Buffer.concat(chunks));
        });
      }
    );
  } catch (err) {
    return done(err as RequestError);
  }
  req.on('error', (error: Error) => done(error as RequestError));
}
