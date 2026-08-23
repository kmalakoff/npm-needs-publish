import tarStream from 'tar-stream';
import zlib from 'zlib';

export type UntarCallback = (error: Error | null, files?: Record<string, Buffer>) => void;

// Extracts a gzipped tarball to a map of entry path to contents, regular files only.
export function untar(tarball: Buffer, callback: UntarCallback): void {
  zlib.gunzip(tarball, (gzipError: Error | null, tarBuffer: Buffer) => {
    if (gzipError) return callback(gzipError);

    const files: Record<string, Buffer> = {};
    const extract = tarStream.extract();

    let settled = false;
    function done(error: Error | null, result?: Record<string, Buffer>): void {
      if (settled) return;
      settled = true;
      callback(error, result);
    }

    extract.on('entry', (header, stream, next) => {
      if (header.type !== 'file') {
        stream.on('end', next);
        stream.resume();
        return;
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', (error: Error) => done(error));
      stream.on('end', () => {
        files[header.name] = Buffer.concat(chunks);
        next();
      });
    });

    extract.on('error', (error: Error) => done(error));
    extract.on('finish', () => done(null, files));

    extract.end(tarBuffer);
  });
}
