/* A ZIP writer, stored (uncompressed) entries only.
 *
 * A .docx is a ZIP of a few small XML parts, and that is the only ZIP this
 * project will ever write — so rather than pull in an archiver, here are the
 * three record types the format needs. Stored entries keep it to a CRC and
 * some little-endian headers; the parts are a few KB, so the compression
 * would not have earned its complexity. */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Bytes out, little-endian, in the order the spec lists the fields. */
class Writer {
  private readonly parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

export function zip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const body = new Writer();
  const directory = new Writer();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const sum = crc32(entry.data);
    const offset = body.length;

    // Local file header. Flag 0x0800 says the name is UTF-8; method 0 is store.
    body.u32(0x04034b50);
    body.u16(20);
    body.u16(0x0800);
    body.u16(0);
    body.u16(0); // time and date: left at zero, the epoch Word shows for these
    body.u16(0);
    body.u32(sum);
    body.u32(entry.data.length);
    body.u32(entry.data.length);
    body.u16(name.length);
    body.u16(0);
    body.push(name);
    body.push(entry.data);

    directory.u32(0x02014b50);
    directory.u16(20);
    directory.u16(20);
    directory.u16(0x0800);
    directory.u16(0);
    directory.u16(0);
    directory.u16(0);
    directory.u32(sum);
    directory.u32(entry.data.length);
    directory.u32(entry.data.length);
    directory.u16(name.length);
    directory.u16(0);
    directory.u16(0);
    directory.u16(0);
    directory.u16(0);
    directory.u32(0);
    directory.u32(offset);
    directory.push(name);
  }

  const end = new Writer();
  end.u32(0x06054b50);
  end.u16(0);
  end.u16(0);
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(directory.length);
  end.u32(body.length);
  end.u16(0);

  const out = new Uint8Array(body.length + directory.length + end.length);
  out.set(body.concat(), 0);
  out.set(directory.concat(), body.length);
  out.set(end.concat(), body.length + directory.length);
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
