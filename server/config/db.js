import mongoose from 'mongoose';

/**
 * 连接 MongoDB：
 * - MONGO_URI=memory 时使用 mongodb-memory-server（免安装，开发演示用，数据重启即清空）
 * - 否则连接 MONGO_URI 指定的真实 MongoDB 实例
 */
export async function connectDB() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not defined in .env');
  }

  if (uri === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    uri = mem.getUri('login_demo');
    console.log('[db] 使用内存版 MongoDB（仅开发演示，数据不持久化）');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[db] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}
