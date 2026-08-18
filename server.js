require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ========== MongoDB 连接 ==========
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://mffttttt0705_db_user:LZQ704525@cluster0.lpunuuy.mongodb.net/?appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB 连接成功'))
.catch(err => console.error('❌ MongoDB 连接失败:', err));

// ========== 数据模型 ==========
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['boss', 'handler', 'admin'], default: 'boss' },
  phone: String,
  game: String,
  status: { type: String, enum: ['active', 'banned'], default: 'active' },
  handlerStatus: { type: String, enum: ['idle', 'busy'], default: 'idle' },
  balance: { type: Number, default: 0 },
  diamond: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({
  game: String,
  title: String,
  desc: String,
  price: Number,
  quantity: Number,
  sold: { type: Number, default: 0 },
  hidden: { type: Boolean, default: false },
  createTime: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
  productId: mongoose.Schema.Types.ObjectId,
  bossId: mongoose.Schema.Types.ObjectId,
  handlerId: mongoose.Schema.Types.ObjectId,
  status: { type: String, enum: ['pending', 'ongoing', 'review', 'completed', 'canceled', 'rejected'], default: 'pending' },
  price: Number,
  game: String,
  title: String,
  desc: String,
  createTime: { type: Date, default: Date.now },
  startTime: Date,
  endTime: Date,
  messages: [{ sender: String, content: String, time: Date }],
  settled: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false }
});
const Order = mongoose.model('Order', OrderSchema);

const RechargeSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  diamond: Number,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createTime: { type: Date, default: Date.now },
  approveTime: Date
});
const Recharge = mongoose.model('Recharge', RechargeSchema);

// ========== 公告模型 ==========
const AnnounceSchema = new mongoose.Schema({
  content: { type: String, default: '欢迎使用 QW电竞护航平台！' },
  images: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
const Announce = mongoose.model('Announce', AnnounceSchema);

// 初始化公告
async function initAnnounce() {
  const count = await Announce.countDocuments();
  if (count === 0) {
    const announce = new Announce({
      content: '欢迎使用 QW电竞护航平台！',
      images: []
    });
    await announce.save();
  }
}
initAnnounce();

// ========== 中间件 ==========
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: '未授权' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'mysecretkey123');
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: '无效token' });
  }
};

// ========== 注册 & 登录 ==========
app.post('/api/register', async (req, res) => {
  const { username, password, role, phone, game } = req.body;
  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: '用户名已存在' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed, role, phone, game });
    await user.save();
    res.json({ message: '注册成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: '用户不存在' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: '密码错误' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'mysecretkey123', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username, role: user.role, diamond: user.diamond, balance: user.balance } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId).select('-password');
  res.json(user);
});

// ========== 公告 API ==========
app.get('/api/announce', async (req, res) => {
  const announce = await Announce.findOne().sort({ updatedAt: -1 });
  res.json(announce || { content: '欢迎使用 QW电竞护航平台！', images: [] });
});

app.put('/api/admin/announce', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { content, images } = req.body;
  await Announce.deleteMany({});
  const announce = new Announce({ content, images: images || [] });
  await announce.save();
  res.json({ success: true, message: '公告已更新' });
});

// ========== 商品 API ==========
app.get('/api/products', async (req, res) => {
  const products = await Product.find({ hidden: false, $expr: { $gt: ['$quantity', '$sold'] } }).sort({ createTime: -1 });
  res.json(products);
});

app.get('/api/admin/products', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权访问' });
  const products = await Product.find().sort({ createTime: -1 });
  res.json(products);
});

app.post('/api/admin/products', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { game, title, desc, price, quantity } = req.body;
  const product = new Product({ game, title, desc, price, quantity, sold: 0 });
  await product.save();
  res.json(product);
});

// 商品下架
app.put('/api/admin/products/:id/unshelf', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: '商品不存在' });
    product.hidden = true;
    await product.save();
    res.json({ success: true, message: '商品已下架' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 订单 API ==========
app.post('/api/orders/buy', verifyToken, async (req, res) => {
  const { productId } = req.body;
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ error: '商品不存在' });
  if (product.quantity <= product.sold) return res.status(400).json({ error: '库存不足' });
  const user = await User.findById(req.userId);
  const diamondCost = product.price * 10;
  if (user.diamond < diamondCost) return res.status(400).json({ error: '红钻不足' });
  user.diamond -= diamondCost;
  await user.save();
  const order = new Order({
    productId: product._id,
    bossId: user._id,
    status: 'pending',
    price: product.price,
    game: product.game,
    title: product.title,
    desc: product.desc || '',
    messages: [{ sender: 'system', content: `🎉 订单已创建，订单号: ${order._id}`, time: new Date() }]
  });
  await order.save();
  product.sold += 1;
  await product.save();
  res.json({ orderId: order._id, message: '购买成功' });
});

app.get('/api/orders/my', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  let query = {};
  if (user.role === 'boss') query.bossId = user._id;
  else if (user.role === 'handler') query.handlerId = user._id;
  else return res.status(403).json({ error: '无权查看' });
  const orders = await Order.find(query).sort({ createTime: -1 });
  res.json(orders);
});

app.get('/api/admin/orders', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权访问' });
  const orders = await Order.find().sort({ createTime: -1 });
  res.json(orders);
});

app.put('/api/admin/orders/:id/assign', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { handlerId } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  const handler = await User.findById(handlerId);
  if (!handler || handler.role !== 'handler') return res.status(400).json({ error: '无效打手' });
  order.handlerId = handlerId;
  order.status = 'ongoing';
  order.startTime = new Date();
  await order.save();
  res.json({ message: '指派成功' });
});

app.put('/api/admin/orders/:id/force-complete', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.status = 'completed';
  order.endTime = new Date();
  await order.save();
  res.json({ message: '强制完成成功' });
});

app.put('/api/admin/orders/:id/confirm', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.status = 'completed';
  order.endTime = new Date();
  await order.save();
  res.json({ message: '验收通过' });
});

app.put('/api/admin/orders/:id/reject', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { reason } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.status = 'rejected';
  order.rejectReason = reason;
  await order.save();
  res.json({ message: '已驳回' });
});

app.put('/api/admin/orders/:id/cancel', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  order.status = 'canceled';
  await order.save();
  const boss = await User.findById(order.bossId);
  if (boss) {
    boss.diamond += order.price * 10;
    await boss.save();
  }
  res.json({ message: '订单已取消' });
});

app.put('/api/admin/orders/:id/settle', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { earning } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  const handler = await User.findById(order.handlerId);
  if (!handler) return res.status(400).json({ error: '打手不存在' });
  handler.balance += earning;
  await handler.save();
  order.settled = true;
  await order.save();
  res.json({ message: '结算成功' });
});

// ========== 充值 API ==========
app.post('/api/recharges', verifyToken, async (req, res) => {
  const { amount, diamond } = req.body;
  const recharge = new Recharge({ userId: req.userId, amount, diamond });
  await recharge.save();
  res.json({ message: '充值申请已提交' });
});

app.get('/api/admin/recharges', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权访问' });
  const recharges = await Recharge.find().sort({ createTime: -1 });
  res.json(recharges);
});

// 充值审核通过
app.put('/api/admin/recharges/:id/approve', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
    const recharge = await Recharge.findById(req.params.id);
    if (!recharge) return res.status(404).json({ error: '记录不存在' });
    if (recharge.status !== 'pending') return res.status(400).json({ error: '已处理' });
    recharge.status = 'approved';
    recharge.approveTime = new Date();
    await recharge.save();
    const targetUser = await User.findById(recharge.userId);
    if (targetUser) {
      targetUser.diamond = (targetUser.diamond || 0) + recharge.diamond;
      await targetUser.save();
    }
    res.json({ success: true, message: '审核通过，红钻已到账' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 充值审核拒绝
app.put('/api/admin/recharges/:id/reject', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
    const recharge = await Recharge.findById(req.params.id);
    if (!recharge) return res.status(404).json({ error: '记录不存在' });
    recharge.status = 'rejected';
    recharge.approveTime = new Date();
    await recharge.save();
    res.json({ success: true, message: '已拒绝' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== 打手 API ==========
app.put('/api/orders/:id/take', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'handler') return res.status(403).json({ error: '只有打手可接单' });
  if (user.handlerStatus === 'busy') return res.status(400).json({ error: '当前忙碌' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '订单不可接' });
  order.handlerId = user._id;
  order.status = 'ongoing';
  order.startTime = new Date();
  await order.save();
  res.json({ message: '接单成功' });
});

app.put('/api/orders/:id/submit-complete', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'handler') return res.status(403).json({ error: '只有打手可操作' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.handlerId.toString() !== user._id.toString()) return res.status(403).json({ error: '不是你的订单' });
  if (order.status !== 'ongoing') return res.status(400).json({ error: '只有进行中可提交' });
  order.status = 'review';
  await order.save();
  res.json({ message: '已提交验收' });
});

app.put('/api/orders/:id/boss-confirm', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'boss') return res.status(403).json({ error: '只有老板可操作' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.bossId.toString() !== user._id.toString()) return res.status(403).json({ error: '不是你的订单' });
  if (order.status !== 'review') return res.status(400).json({ error: '只有待验收可确认' });
  order.status = 'completed';
  order.endTime = new Date();
  await order.save();
  res.json({ message: '已确认完成，等待管理员结算' });
});

// ========== 聊天 ==========
app.post('/api/orders/:id/chat', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.bossId.toString() !== user._id.toString() && order.handlerId && order.handlerId.toString() !== user._id.toString()) {
    return res.status(403).json({ error: '无权操作' });
  }
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: '内容不能为空' });
  const sender = user.role === 'boss' ? 'boss' : user.role === 'handler' ? 'handler' : 'system';
  order.messages.push({ sender, content, time: new Date() });
  await order.save();
  res.json({ message: '发送成功' });
});

// ========== 用户管理 ==========
app.get('/api/admin/users', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权访问' });
  const users = await User.find().select('-password');
  res.json(users);
});

app.put('/api/admin/users/:id/ban', verifyToken, async (req, res) => {
  const admin = await User.findById(req.userId);
  if (admin.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  target.status = target.status === 'active' ? 'banned' : 'active';
  await target.save();
  res.json({ success: true, message: '用户状态已更新' });
});

app.put('/api/admin/users/:id/reset-password', verifyToken, async (req, res) => {
  const admin = await User.findById(req.userId);
  if (admin.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  target.password = await bcrypt.hash('123456', 10);
  await target.save();
  res.json({ success: true, message: '密码已重置为 123456' });
});

// ========== 管理员赠送红钻 ==========
app.post('/api/admin/gift', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { targetUserId, amount } = req.body;
  const target = await User.findById(targetUserId);
  if (!target) return res.status(404).json({ error: '目标用户不存在' });
  target.diamond = (target.diamond || 0) + amount;
  await target.save();
  res.json({ message: '赠送成功' });
});

// ========== 根路由 ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== 启动服务器 ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 服务器运行在端口 ${PORT}`));