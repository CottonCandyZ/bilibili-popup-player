// Temporary diagnosis for issue #10; removed once the runtime is understood.
import test from 'node:test';
import { UGC_CORE_SCRIPT } from '../src/constants.js';

test('inspect the native horizontal shortcut implementation for issue #10', async () => {
  const response = await fetch(UGC_CORE_SCRIPT, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Native core HTTP ' + response.status);
  const source = await response.text();
  console.log('Native core length:', source.length);
  for (const pattern of ['ArrowRight', 'ArrowLeft', 'case 39:', 'case 37:', 'seekStep', 'fastForward', 'keydown', 'keyup']) {
    let offset = 0;
    for (let count = 0; count < 5; count++) {
      const index = source.indexOf(pattern, offset);
      if (index < 0) break;
      console.log(JSON.stringify({ pattern, index, excerpt: source.slice(Math.max(0, index - 1200), index + 2200) }));
      offset = index + pattern.length;
    }
  }
});
