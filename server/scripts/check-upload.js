import assert from 'node:assert/strict';
import { uploadFile, downloadUrl, destroyFile, cloudinaryReady } from '../src/cloudinary.js';

// Explicit integration diagnostic: uploads two tiny synthetic assets and removes them.
// Never uploads local/user documents and never prints signed URLs or API credentials.
if (!cloudinaryReady()) throw new Error('Cloudinary credentials are not configured');
const created = [];
try {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOpcAAAAASUVORK5CYII=',
    'base64'
  );
  const logo = await uploadFile({ buffer: image }, true);
  created.push({ publicId: logo.public_id, resourceType: 'image', type: 'upload' });
  const logoResponse = await fetch(logo.secure_url);
  assert.equal(logoResponse.ok, true, 'Public logo delivery failed');
  console.log('Cloudinary logo upload and delivery: passed');

  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );
  const doc = await uploadFile({ buffer: pdf }, false);
  const file = { publicId: doc.public_id, resourceType: doc.resource_type };
  created.push({ ...file, type: 'authenticated' });
  // Cloudinary may return an already-signed secure_url for authenticated uploads.
  const unsignedUrl = new URL(doc.secure_url);
  unsignedUrl.pathname = unsignedUrl.pathname.replace(/\/s--[^/]+--\//, '/');
  const unsigned = await fetch(unsignedUrl);
  assert.equal(unsigned.ok, false, 'Attachment must not be publicly readable');
  const signed = await fetch(downloadUrl(file));
  assert.equal(signed.ok, true, `Authenticated download failed with HTTP ${signed.status}`);
  assert.deepEqual(Buffer.from(await signed.arrayBuffer()), pdf);
  console.log('Cloudinary private document upload, access restriction and signed download: passed');
} finally {
  const results = await Promise.allSettled(
    created.map((asset) => destroyFile(asset.publicId, asset.resourceType, asset.type))
  );
  console.log(
    `Cloudinary diagnostic cleanup: ${results.filter((r) => r.status === 'fulfilled').length}/${created.length} assets removed`
  );
  if (results.some((r) => r.status === 'rejected')) process.exitCode = 1;
}
