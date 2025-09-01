declare module 'istextorbinary' {
  export function isBinary(filename?: string | null, buffer?: Buffer | null): boolean | null;
  export function isText(filename?: string | null, buffer?: Buffer | null): boolean | null;
  export function getEncoding(buffer: Buffer | null, opts?: { chunkLength?: number; chunkBegin?: number }): 'utf8' | 'binary' | null;
}