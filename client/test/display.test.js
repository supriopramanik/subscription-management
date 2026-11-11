import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDisplay, initialDisplayMode, isTvBrowser, DISPLAY_WIDTH } from '../src/display.js';

test('TV canvas stays within safe edges at common TV browser and sharing resolutions', () => {
  for (const [width, height] of [
    [960, 540],
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [3840, 2160],
    [1280, 600],
  ]) {
    for (const contentHeight of [1080, 1380]) {
      const fit = fitDisplay(width, height, contentHeight);
      const scale = Number(fit.transform.slice(6, -1));
      assert.equal(fit.width, DISPLAY_WIDTH);
      assert.ok(fit.left >= width * 0.04 - 0.001);
      assert.ok(fit.top >= height * 0.04 - 0.001);
      assert.ok(fit.left + fit.width * scale <= width * 0.96 + 0.001);
      assert.ok(fit.top + fit.height * scale <= height * 0.96 + 0.001);
    }
  }
});

test('TV detection covers TV engines and remote-only Android browsers without selecting phones or tablets', () => {
  for (const ua of [
    'SMART-TV Tizen/6.0',
    'Web0S SmartTV',
    'HbbTV/1.5',
    'Android TV',
    'Android 9 AFTMM',
    'Linux; Android 9; MIBOX4',
  ]) {
    assert.equal(isTvBrowser(ua), true, ua);
  }
  assert.equal(isTvBrowser('Windows NT 10.0 Chrome/130.0'), false);
  assert.equal(isTvBrowser('Android 14; Mobile Chrome/130.0', 5), false);
  assert.equal(isTvBrowser('Android 14 Chrome/130.0', 10), false);
});

test('explicit display links and remembered choices override automatic TV detection', () => {
  assert.equal(initialDisplayMode({ search: '?demo=1&display=1', saved: '0' }), true);
  assert.equal(
    initialDisplayMode({ search: '?display=0', saved: '1', userAgent: 'SmartTV' }),
    false
  );
  assert.equal(initialDisplayMode({ saved: '1' }), true);
  assert.equal(initialDisplayMode({ saved: '0', userAgent: 'SmartTV' }), false);
  assert.equal(initialDisplayMode({ userAgent: 'SmartTV' }), true);
  assert.equal(initialDisplayMode({}), false);
});
