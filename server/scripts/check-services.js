import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../src/config.js';
import { cloudinaryReady } from '../src/cloudinary.js';

// Read-only checks. Never logs URIs, account identifiers, API keys or secrets.
if (!config.mongoUri) console.log('MongoDB: MONGODB_URI is missing');
else {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    console.log(
      `MongoDB: connected; transactions ${topology.setName || topology.msg === 'isdbgrid' ? 'supported' : 'require a replica set'}`
    );
  } catch {
    console.log(
      'MongoDB: connection failed. Check network access/IP allowlist, DNS and credentials.'
    );
  } finally {
    await mongoose.disconnect();
  }
}
if (!cloudinaryReady())
  console.log('Cloudinary: credentials missing or URL is not in cloudinary:// format');
else {
  try {
    await cloudinary.api.ping();
    console.log('Cloudinary: authenticated successfully');
  } catch {
    console.log('Cloudinary: authentication or network check failed');
  }
}
