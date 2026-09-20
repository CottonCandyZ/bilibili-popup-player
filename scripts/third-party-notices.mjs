import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Keep upstream notices with the single-file userscript, including runtime
// dependencies that are pulled in indirectly by the UI libraries.
export function readThirdPartyNotices(manifestPath) {
  const visited = new Set();
  const notices = [];
  function visit(name, from) {
    const require = createRequire(from);
    let path;
    try { path = require.resolve(`${name}/package.json`); }
    catch {
      let directory = dirname(require.resolve(name));
      while (!existsSync(join(directory, 'package.json'))) {
        const parent = dirname(directory);
        if (parent === directory) throw new Error(`Cannot locate package.json for ${name}`);
        directory = parent;
      }
      path = join(directory, 'package.json');
    }
    path = realpathSync(path);
    if (visited.has(path)) return;
    visited.add(path);
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    const directory = dirname(path);
    const files = readdirSync(directory).filter(file => /^(?:licen[cs]e|copying|notice)(?:\.[\w-]+)?$/i.test(file)).sort();
    if (!files.length) throw new Error(`Missing third-party license for ${pkg.name}`);
    const text = files.map(file => readFileSync(join(directory, file), 'utf8').trim()).join('\n\n');
    notices.push({ name: `${pkg.name}@${pkg.version}`, text: `${pkg.name}@${pkg.version} (${pkg.license})\n\n${text}` });
    for (const dependency of Object.keys(pkg.dependencies || {})) visit(dependency, path);
  }
  const root = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const name of Object.keys(root.dependencies || {})) visit(name, manifestPath);
  return 'Bilibili Popup Player — third-party runtime dependencies\n' +
    'These components retain their respective copyright notices and licenses.\n\n' +
    notices.sort((a, b) => a.name.localeCompare(b.name, 'en')).map(item => item.text).join('\n\n' + '='.repeat(72) + '\n\n').replace(/\r\n/g, '\n') + '\n';
}
