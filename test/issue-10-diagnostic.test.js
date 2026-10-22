// Temporary native-runtime diagnosis for issue #10.
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { UGC_CORE_SCRIPT } from '../src/constants.js';

test('inspect native controls and save an offline reproduction runtime', async () => {
  const targets = [
    UGC_CORE_SCRIPT,
    new URL('widgets/npd.pc-helper.5cb7b2df.js', UGC_CORE_SCRIPT).href,
    new URL('widgets/npd.common-helper.44437a31.js', UGC_CORE_SCRIPT).href,
    new URL('widgets/npd.root-extra.3c4b2142.js', UGC_CORE_SCRIPT).href,
  ];
  await mkdir('.native-runtime', { recursive: true });
  for (const url of targets) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Native core HTTP ' + response.status + ': ' + url);
    let source = await response.text();
    await writeFile('.native-runtime/' + new URL(url).pathname.split('/').pop(), source);
    console.log('Native asset:', url, 'length:', source.length);
    for (const pattern of ['ArrowRight', 'ArrowLeft', 'keyCode', 'keydown', 'keyup', 'disabled.shortcut', 'disabled.seek', 'shortCut']) {
      let offset = 0;
      for (let count = 0; count < 3; count++) {
        const index = source.indexOf(pattern, offset);
        if (index < 0) break;
        console.log(JSON.stringify({ url, pattern, index, excerpt: source.slice(Math.max(0, index - 900), index + 2200) }));
        offset = index + pattern.length;
      }
    }
  }
});
