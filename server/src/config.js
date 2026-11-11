import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
dotenv.config({ quiet: true });

const production = process.env.NODE_ENV === 'production';
export const config = {
  production,
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI,
  origin: (process.env.APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, ''),
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : production,
  trustProxy: Number(process.env.TRUST_PROXY || 1),
  cloudinaryUrl: process.env.CLOUDINARY_URL || process.env.CLOUDINARY_BACKUP_URL,
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || 'complaiance-subscriptions',
};
