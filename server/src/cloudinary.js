import { v2 as cloudinary } from 'cloudinary';
import { fileTypeFromBuffer } from 'file-type';
import { config } from './config.js';

if (config.cloudinaryUrl?.startsWith('cloudinary://')) {
  const url = new URL(config.cloudinaryUrl);
  cloudinary.config({
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true,
  });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}
export function cloudinaryReady() {
  const c = cloudinary.config();
  return Boolean(c.cloud_name && c.api_key && c.api_secret);
}
export async function uploadFile(file, isLogo) {
  if (!cloudinaryReady())
    throw Object.assign(
      new Error('Cloudinary credentials are not configured. Set CLOUDINARY_URL on the server.'),
      { status: 503 }
    );
  const detected = await fileTypeFromBuffer(file.buffer);
  const allowed = isLogo
    ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    : [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
  if (!detected || !allowed.includes(detected.mime))
    throw Object.assign(
      new Error(
        'Unsupported file content. Use JPG, PNG, WebP, GIF, PDF, DOCX or XLSX; logos must be images.'
      ),
      { status: 400 }
    );
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: config.cloudinaryFolder,
          resource_type: isLogo ? 'image' : 'raw',
          type: isLogo ? 'upload' : 'authenticated',
          ...(isLogo ? { transformation: [{ width: 256, height: 256, crop: 'limit' }] } : {}),
        },
        (error, response) => (error ? reject(error) : resolve(response))
      )
      .end(file.buffer);
  });
  return { ...result, mime: detected.mime };
}
export function downloadUrl(file) {
  return cloudinary.utils.private_download_url(file.publicId, '', {
    resource_type: file.resourceType || 'raw',
    type: 'authenticated',
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + 120,
  });
}
export async function destroyFile(publicId, resourceType = 'raw', type = 'authenticated') {
  if (publicId)
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type,
      invalidate: true,
    });
}
