import { Script } from 'node:vm';

export function getUserscriptHeader(code, filename = 'userscript') {
  const header = code.match(/^\/\/ ==UserScript==\r?\n((?:\/\/[^\r\n]*\r?\n)*)\/\/ ==\/UserScript==(?=\r?\n)/);
  if (!header) throw new Error(`${filename}: missing a valid UserScript metadata header at the start of the file`);
  return header[0];
}

export function validateUserscript(code, filename = 'userscript') {
  const header = getUserscriptHeader(code, filename);
  const metadata = {};
  for (const line of header.split(/\r?\n/)) {
    const field = line.match(/^\/\/\s+@(\S+)\s+(.+?)\s*$/);
    if (field) (metadata[field[1]] ||= []).push(field[2]);
  }
  for (const key of ['name', 'namespace', 'version', 'match', 'run-at', 'grant', 'updateURL', 'downloadURL']) {
    if (!metadata[key]?.length) throw new Error(`${filename}: missing @${key} metadata`);
  }
  for (const key of ['name', 'namespace', 'version', 'updateURL', 'downloadURL']) {
    if (metadata[key].length !== 1) throw new Error(`${filename}: expected exactly one @${key}`);
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.version[0])) {
    throw new Error(`${filename}: @version must be a stable major.minor.patch version`);
  }
  for (const key of ['updateURL', 'downloadURL']) {
    let url;
    try { url = new URL(metadata[key][0]); } catch { /* Report a metadata error below. */ }
    if (!url || url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`${filename}: @${key} must be an absolute HTTPS URL without credentials`);
    }
  }
  // Parse the final artifact as a classic script, as userscript managers do.
  new Script(code, { filename });
  return metadata;
}
