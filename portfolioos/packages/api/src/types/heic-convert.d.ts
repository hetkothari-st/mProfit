// heic-convert ships no types. Only the call shape the Documents sorter uses.
declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}
