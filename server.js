require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
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
  status: { type: String, enum: ['onsale', 'soldout'], default: 'onsale' },
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
  reviewImages: [String],
  rejectReason: String,
  remark: String,
  settled: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false }
});
const Order = mongoose.model('Order', OrderSchema);

const TransactionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  orderId: mongoose.Schema.Types.ObjectId,
  type: { type: String, enum: ['income', 'outcome'] },
  amount: Number,
  status: { type: String, enum: ['pending', 'paid'], default: 'paid' },
  time: { type: Date, default: Date.now },
  desc: String
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const RechargeSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  diamond: Number,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createTime: { type: Date, default: Date.now },
  approveTime: Date
});
const Recharge = mongoose.model('Recharge', RechargeSchema);

const MailSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  type: { type: String, enum: ['recharge', 'gift', 'system'] },
  title: String,
  content: String,
  diamond: Number,
  status: { type: String, enum: ['unread', 'read'], default: 'unread' },
  createTime: { type: Date, default: Date.now },
  claimTime: Date
});
const Mail = mongoose.model('Mail', MailSchema);

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

// ========== API 路由 ==========

// 注册
app.post('/api/register', async (req, res) => {
  const { username, password, role, phone, game } = req.body;
  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: '用户名已存在' });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed, role, phone, game });
    await user.save();
    res.json({ message: '注册成功', userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 登录
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

// 获取当前用户信息
app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- 商品 API ----------
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({ hidden: false, $expr: { $gt: ['$quantity', '$sold'] } }).sort({ createTime: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// ---------- 订单 API ----------
app.post('/api/orders/buy', verifyToken, async (req, res) => {
  const { productId } = req.body;
  try {
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
      handlerId: null,
      status: 'pending',
      price: product.price,
      game: product.game,
      title: product.title,
      desc: product.desc || '',
      messages: [{ sender: 'system', content: `🎉 订单已创建，订单号: ${order._id}`, time: new Date() }],
    });
    await order.save();
    product.sold += 1;
    await product.save();
    const trans = new Transaction({
      userId: user._id,
      orderId: order._id,
      type: 'outcome',
      amount: diamondCost,
      status: 'paid',
      desc: `购买商品 ${product.title}，扣除 ${diamondCost} 红钻`
    });
    await trans.save();
    res.json({ orderId: order._id, message: '购买成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/my', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    let query = {};
    if (user.role === 'boss') query.bossId = user._id;
    else if (user.role === 'handler') query.handlerId = user._id;
    else return res.status(403).json({ error: '无权查看' });
    const orders = await Order.find(query).sort({ createTime: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  const trans = new Transaction({
    userId: order.bossId,
    orderId: order._id,
    type: 'income',
    amount: order.price * 10,
    status: 'pending',
    desc: `订单 ${order._id} 红钻冻结`
  });
  await trans.save();
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
    const trans = new Transaction({
      userId: order.bossId,
      orderId: order._id,
      type: 'income',
      amount: order.price * 10,
      status: 'paid',
      desc: `订单 ${order._id} 取消，退还红钻`
    });
    await trans.save();
  }
  res.json({ message: '已取消' });
});

app.put('/api/admin/orders/:id/settle', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { earning } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  if (order.settled) return res.status(400).json({ error: '已结算' });
  const handler = await User.findById(order.handlerId);
  if (!handler) return res.status(400).json({ error: '打手不存在' });
  handler.balance += earning;
  await handler.save();
  order.settled = true;
  await order.save();
  const trans = new Transaction({
    userId: handler._id,
    orderId: order._id,
    type: 'outcome',
    amount: earning * 10,
    status: 'paid',
    desc: `订单 ${order._id} 结算收入 ${earning}元`
  });
  await trans.save();
  const freeze = await Transaction.findOne({ orderId: order._id, type: 'income', status: 'pending' });
  if (freeze) { freeze.status = 'paid'; await freeze.save(); }
  res.json({ message: '结算成功' });
});

// ---------- 充值 API ----------
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

app.put('/api/admin/recharges/:id/approve', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const recharge = await Recharge.findById(req.params.id);
  if (!recharge) return res.status(404).json({ error: '记录不存在' });
  if (recharge.status !== 'pending') return res.status(400).json({ error: '已处理' });
  recharge.status = 'approved';
  recharge.approveTime = new Date();
  await recharge.save();
  const mail = new Mail({
    userId: recharge.userId,
    type: 'recharge',
    title: '充值成功',
    content: `您充值 ¥${recharge.amount} 获得 ${recharge.diamond} 红钻，请点击领取。`,
    diamond: recharge.diamond
  });
  await mail.save();
  res.json({ message: '审核通过，已发送邮件' });
});

app.put('/api/admin/recharges/:id/reject', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const recharge = await Recharge.findById(req.params.id);
  if (!recharge) return res.status(404).json({ error: '记录不存在' });
  recharge.status = 'rejected';
  recharge.approveTime = new Date();
  await recharge.save();
  res.json({ message: '已拒绝' });
});

// ---------- 邮件 API ----------
app.get('/api/mails', verifyToken, async (req, res) => {
  const mails = await Mail.find({ userId: req.userId }).sort({ createTime: -1 });
  res.json(mails);
});

app.put('/api/mails/:id/claim', verifyToken, async (req, res) => {
  const mail = await Mail.findById(req.params.id);
  if (!mail) return res.status(404).json({ error: '邮件不存在' });
  if (mail.userId.toString() !== req.userId) return res.status(403).json({ error: '无权操作' });
  if (mail.status !== 'unread') return res.status(400).json({ error: '已领取' });
  const user = await User.findById(req.userId);
  user.diamond += mail.diamond;
  await user.save();
  mail.status = 'read';
  mail.claimTime = new Date();
  await mail.save();
  const trans = new Transaction({
    userId: req.userId,
    orderId: null,
    type: 'income',
    amount: mail.diamond,
    status: 'paid',
    desc: `邮件领取 ${mail.diamond} 红钻（${mail.title}）`
  });
  await trans.save();
  res.json({ message: `领取成功，获得 ${mail.diamond} 红钻` });
});

app.post('/api/admin/gift', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { targetUserId, amount } = req.body;
  const target = await User.findById(targetUserId);
  if (!target) return res.status(404).json({ error: '目标用户不存在' });
  const mail = new Mail({
    userId: targetUserId,
    type: 'gift',
    title: '管理员赠送红钻',
    content: `管理员赠送您 ${amount} 红钻，请点击领取。`,
    diamond: amount
  });
  await mail.save();
  res.json({ message: '赠送成功，已发送邮件' });
});

// ---------- 打手相关 ----------
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
  const trans = new Transaction({
    userId: order.bossId,
    orderId: order._id,
    type: 'income',
    amount: order.price * 10,
    status: 'pending',
    desc: `订单 ${order._id} 红钻冻结`
  });
  await trans.save();
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

// ---------- 用户管理（管理员） ----------
app.get('/api/admin/users', verifyToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: '无权访问' });
  const users = await User.find().select('-password');
  res.json(users);
});

// ---------- 根路由返回前端页面 ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- 启动服务器 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 服务器运行在端口 ${PORT}`));