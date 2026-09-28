import { inflateRawSync } from "node:zlib";

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 250,
  maxCompressedBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 75 * 1024 * 1024,
  maxSingleFileBytes: 10 * 1024 * 1024,
  maxCompressionRatio: 20,
  maxPathLength: 240,
});

export class ArchiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
  }
}

export function readZip(input, customLimits = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const limits = { ...DEFAULT_LIMITS, ...customLimits };
  if (buffer.length > limits.maxCompressedBytes) {
    throw new ArchiveError("ARCHIVE_TOO_LARGE", `Archive exceeds ${limits.maxCompressedBytes} bytes`);
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const fileCount = buffer.readUInt16LE(eocdOffset + 10);
  const directorySize = buffer.readUInt32LE(eocdOffset + 12);
  const directoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (fileCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new ArchiveError("ZIP64_NOT_SUPPORTED", "ZIP64 archives are not supported");
  }
  if (fileCount > limits.maxFiles) throw new ArchiveError("TOO_MANY_FILES", `Archive contains ${fileCount} entries`);
  if (directoryOffset + directorySize > buffer.length) throw new ArchiveError("INVALID_DIRECTORY", "ZIP central directory is out of bounds");

  const files = new Map();
  const names = new Set();
  let cursor = directoryOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < fileCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new ArchiveError("INVALID_DIRECTORY_ENTRY", `Invalid ZIP directory entry ${index + 1}`);
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ArchiveError("ZIP64_NOT_SUPPORTED", "ZIP64 entries are not supported");
    }
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > buffer.length) throw new ArchiveError("INVALID_DIRECTORY_ENTRY", "ZIP entry metadata is out of bounds");
    if (flags & 1) throw new ArchiveError("ENCRYPTED_ARCHIVE", "Encrypted ZIP entries are not supported");
    if (![0, 8].includes(method)) throw new ArchiveError("UNSUPPORTED_COMPRESSION", `ZIP compression method ${method} is not supported`);

    const name = normalizePath(buffer.subarray(nameStart, nameEnd).toString("utf8"), limits);
    const foldedName = name.toLocaleLowerCase("en-US");
    if (names.has(foldedName)) throw new ArchiveError("DUPLICATE_PATH", `Duplicate or case-colliding path: ${name}`);
    names.add(foldedName);

    const unixType = (externalAttributes >>> 16) & 0xf000;
    if (unixType === 0xa000) throw new ArchiveError("SYMLINK_NOT_ALLOWED", `Symbolic link is not allowed: ${name}`);
    if (name.endsWith("/")) {
      cursor = nameEnd + extraLength + commentLength;
      continue;
    }
    if (uncompressedSize > limits.maxSingleFileBytes) throw new ArchiveError("FILE_TOO_LARGE", `${name} exceeds the per-file limit`);
    if (compressedSize === 0 && uncompressedSize > 0) throw new ArchiveError("INVALID_COMPRESSION_RATIO", `${name} has an invalid compressed size`);
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      throw new ArchiveError("COMPRESSION_RATIO_EXCEEDED", `${name} exceeds the allowed compression ratio`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) throw new ArchiveError("UNCOMPRESSED_LIMIT_EXCEEDED", "Archive expands beyond the allowed size");

    const data = readEntryData(buffer, { name, method, compressedSize, uncompressedSize, localOffset });
    if (crc32(data) !== expectedCrc) throw new ArchiveError("CRC_MISMATCH", `CRC check failed for ${name}`);
    files.set(name, data);
    cursor = nameEnd + extraLength + commentLength;
  }

  return files;
}

function readEntryData(buffer, entry) {
  const { name, method, compressedSize, uncompressedSize, localOffset } = entry;
  if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new ArchiveError("INVALID_LOCAL_HEADER", `Invalid local header for ${name}`);
  }
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > buffer.length) throw new ArchiveError("TRUNCATED_ENTRY", `Truncated ZIP entry: ${name}`);
  const compressed = buffer.subarray(start, end);
  let data;
  try {
    data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: uncompressedSize + 1 });
  } catch (error) {
    throw new ArchiveError("DECOMPRESSION_FAILED", `Could not decompress ${name}: ${error.message}`);
  }
  if (data.length !== uncompressedSize) throw new ArchiveError("SIZE_MISMATCH", `Uncompressed size does not match for ${name}`);
  return data;
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new ArchiveError("NOT_A_ZIP", "ZIP end-of-central-directory record was not found");
}

function normalizePath(value, limits) {
  if (!value || value.length > limits.maxPathLength) throw new ArchiveError("INVALID_PATH", "ZIP entry path is empty or too long");
  if (value.includes("\0") || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    throw new ArchiveError("INVALID_PATH", `Unsafe ZIP path: ${JSON.stringify(value)}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === ".." || segment === "" && !value.endsWith("/"))) {
    throw new ArchiveError("PATH_TRAVERSAL", `Unsafe ZIP path: ${value}`);
  }
  return value;
}

export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = toDosDate(new Date());

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const directory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(directory.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...localParts, directory, end]);
}

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDate(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function u16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value & 0xffff);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}
