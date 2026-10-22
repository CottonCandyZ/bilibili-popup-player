// Temporary diagnosis for issue #10; removed once the runtime is understood.
import test from 'node:test';
import { UGC_CORE_SCRIPT } from '../src/constants.js';

test('inspect the native horizontal shortcut implementation for issue #10', async () => {
  const response = await fetch(UGC_CORE_SCRIPT, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Native core HTTP ' + response.status);
  let source = await response.text();
  console.log('Native content type:', response.headers.get('content-type'));
  console.log('Native prefix:', source.slice(0, 500));
  source = source.replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  console.log('Decoded prefix:', source.slice(0, 500));
  console.log('Native core length:', source.length);
  for (const pattern of ['toggleFeature', 'shortcut', 'Shortcut', 'seek', 'createPlayer', '__webpack_require__.u', '.js', 'import(', 'core.')) {
    let offset = 0;
    for (let count = 0; count < 3; count++) {
      const index = source.indexOf(pattern, offset);
      if (index < 0) break;
      console.log(JSON.stringify({ pattern, index, excerpt: source.slice(Math.max(0, index - 600), index + 1600) }));
      offset = index + pattern.length;
    }
  }
});
