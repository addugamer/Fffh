import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertOklchToRgb,
  makeCssLegacyCompatible,
  unwrapCssLayers,
  unwrapPropertiesFallbackSupports,
} from './cssCompat';

test('unwrapCssLayers removes @layer wrappers while preserving inner rules and order', () => {
  const input =
    '@layer theme, base, utilities;@layer base{*,:after,:before{box-sizing:border-box}}@layer utilities{.flex{display:flex}}';
  const out = unwrapCssLayers(input);
  assert.equal(out.includes('@layer'), false);
  assert.equal(
    out,
    '*,:after,:before{box-sizing:border-box}.flex{display:flex}',
  );
});

test('unwrapPropertiesFallbackSupports exposes --tw custom property fallbacks unconditionally', () => {
  const input =
    '@supports (((-webkit-hyphens:none)) and (not (margin-trim:block))){*,:before,:after{--tw-border-style:solid;--tw-translate-x:0}}';
  const out = unwrapPropertiesFallbackSupports(input);
  assert.equal(out.includes('@supports'), false);
  assert.equal(out, '*,:before,:after{--tw-border-style:solid;--tw-translate-x:0}');
});

test('convertOklchToRgb converts oklch and alpha colors to rgb/rgba', () => {
  const input = '--a:oklch(98.5% .001 106.423);--b:oklch(50% .2 260 / 50%);';
  const out = convertOklchToRgb(input);
  assert.equal(out.includes('oklch('), false);
  assert.match(out, /^--a:rgb\(\d+,\d+,\d+\);--b:rgba\(\d+,\d+,\d+,0\.5\);$/);
});

test('makeCssLegacyCompatible outputs layer-free and oklch-free CSS', () => {
  const input =
    '@layer properties{@supports (((-webkit-hyphens:none))){*,:before,:after{--tw-border-style:solid}}}@layer theme{:root{--c:oklch(70% .15 50)}}@layer utilities{.p-4{padding:1rem}}';
  const out = makeCssLegacyCompatible(input);
  assert.equal(out.includes('@layer'), false);
  assert.equal(out.includes('oklch'), false);
  assert.ok(out.includes('--tw-border-style:solid'));
  assert.ok(out.includes('.p-4{padding:1rem}'));
});
