// 这个测试文件用于诊断 MongoDB 连接问题
const mongoose = require('mongoose');

// 直接从环境变量读取，确认 Vercel 是否正确传递了 MONGODB_URI
const uri = process.env.MONGODB_URI;

console.log('环境变量 MONGODB_URI 是否存在:', !!uri);
if (uri) {
  console.log('连接字符串前缀:', uri.substring(0, 30) + '...');
}

// 硬编码连接字符串测试（请替换你的密码）
const testUri = 'mongodb+srv://mffttttt0705_db_user:Abc123456@cluster0.lpunuuy.mongodb.net/?appName=Cluster0';

console.log('开始测试连接...');

mongoose.connect(testUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000,
})
.then(() => {
  console.log('✅ MongoDB 连接成功！');
  process.exit(0);
})
.catch(err => {
  console.error('❌ 连接失败:', err.message);
  process.exit(1);
});