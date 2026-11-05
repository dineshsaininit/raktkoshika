import mongoose from 'mongoose';
import { config } from './config.ts';

export async function connectDb(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('error', (e) => console.error('[db] error', e.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[db] connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
