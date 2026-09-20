import { Script } from 'node:vm';

export function validateUserscript(code, filename = 'userscript') {
  const header = code.match(/^\/\/ ==UserScript==\r?\n((?:\/\/[^\r\n]*\r?\n)*)\/\/ ==\/UserScript==(?=\r?\n)/);
  if (!header) throw new Error(`${filename}: missing a valid UserScript metadata header at the start of the file`);
  const metadata = {};
  for (const line of header[1].split(/\r?\n/)) {
    const field = line.match(/^\/\/\s+@(\S+)\s+(.+?)\s*$/);
    if (field) (metadata[field[1]] ||= []).push(field[2]);
  }
  for (const key of ['name', 'namespace', 'version', 'match', 'run-at', 'grant']) {
    if (!metadata[key]?.length) throw new Error(`${filename}: missing @${key} metadata`);
  }
  // Parse the final artifact as a classic script, as userscript managers do.
  new Script(code, { filename });
  return metadata;
}
