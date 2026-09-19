import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAssetQrCode, resolveAssetQr } from '../src/data/assetQr.ts';

const assets = [
  { assetNumber: 'TRIAL-001', qrPayload: 'TITAN-ASSET:TRIAL-001', status: 'Active' },
  { assetNumber: 'TRIAL-002', qrPayload: 'custom-label-002', status: 'Maintenance' },
];
test('asset scanner resolves printed payloads and plain asset labels without following URLs', () => {
  assert.equal(resolveAssetQr('TITAN-ASSET:TRIAL-001', assets).assetNumber, 'TRIAL-001');
  assert.equal(resolveAssetQr(' trial-001 ', assets).assetNumber, 'TRIAL-001');
  assert.throws(() => resolveAssetQr('https://unrelated.example', assets), /does not match/);
  assert.throws(() => resolveAssetQr('custom-label-002', assets), /maintenance/);
  assert.throws(() => resolveAssetQr('TITAN-ASSET:TRIAL-001', [...assets, { ...assets[0], assetNumber: 'DUPLICATE' }]), /more than one/);
});
test('asset QR generation produces a real encoded image for each payload', () => {
  const image = generateAssetQrCode('TITAN-ASSET:TRIAL-001');
  assert.match(image, /^data:image\/gif;base64,/);
  assert.equal(Buffer.from(image.split(',')[1], 'base64').subarray(0,3).toString(), 'GIF');
  assert.notEqual(image, generateAssetQrCode('TITAN-ASSET:TRIAL-002'));
});
