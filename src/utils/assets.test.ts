import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssetUrl } from './assets';

test('resolveAssetUrl converts root-relative asset paths for subpath and GitHub Pages hosting', () => {
  assert.equal(
    resolveAssetUrl('/assets/aistudio/banner.png', './'),
    './assets/aistudio/banner.png',
  );
  assert.equal(
    resolveAssetUrl('/src/assets/images/drill.jpg', '/'),
    './src/assets/images/drill.jpg',
  );
  assert.equal(
    resolveAssetUrl('/src/assets/images/drill.jpg', '/my-shop/'),
    '/my-shop/src/assets/images/drill.jpg',
  );
});

test('resolveAssetUrl leaves external URLs, data URIs, and already-relative URLs untouched', () => {
  assert.equal(resolveAssetUrl('https://example.com/a.png', './'), 'https://example.com/a.png');
  assert.equal(resolveAssetUrl('data:image/png;base64,abc', './'), 'data:image/png;base64,abc');
  assert.equal(resolveAssetUrl('./assets/a.png', './'), './assets/a.png');
  assert.equal(resolveAssetUrl('', './'), '');
});
