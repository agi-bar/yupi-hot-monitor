#!/bin/bash
# HotMonitor 部署脚本
# 使用方法: bash deploy.sh

set -e

echo "🚀 开始部署 HotMonitor..."

# 配置变量
APP_NAME="hotmonitor"
APP_DIR="/www/wwwroot/$APP_NAME"
NODE_VERSION="20"
DOMAIN="your-domain.com"  # 替换为你的域名

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "📦 安装 Node.js $NODE_VERSION..."
    curl -fsSL https://rpm.nodesource.com/setup_$NODE_VERSION.x | bash -
    yum install -y nodejs
fi

echo "Node.js 版本: $(node -v)"
echo "npm 版本: $(npm -v)"

# 2. 创建目录
echo "📁 创建应用目录..."
mkdir -p $APP_DIR
cd $APP_DIR

# 3. 上传代码（需要你手动上传或使用 git clone）
if [ ! -f "package.json" ]; then
    echo "⚠️  请先将代码上传到 $APP_DIR"
    echo "   可以使用: git clone https://github.com/agi-bar/yupi-hot-monitor.git $APP_DIR"
    exit 1
fi

# 4. 安装后端依赖
echo "📦 安装后端依赖..."
cd $APP_DIR/server
npm install --production

# 5. 生成 Prisma Client
echo "🔧 生成 Prisma Client..."
npx prisma generate

# 6. 配置环境变量
echo "⚙️ 配置环境变量..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件配置必要的环境变量"
fi

# 7. 初始化数据库
echo "🗄️  初始化数据库..."
npx prisma db push

# 8. 构建后端
echo "🔨 构建后端..."
npm run build

# 9. 安装前端依赖并构建
echo "📦 安装前端依赖并构建..."
cd $APP_DIR/client
npm install
npm run build

echo ""
echo "✅ 部署准备完成！"
echo ""
echo "📋 下一步操作（宝塔面板）："
echo "1. 网站 → 添加站点 → 填入域名 $DOMAIN"
echo "2. 设置 → 反向代理 → 添加反向代理 → 目标URL: http://127.0.0.1:3001"
echo "3. 网站 → SSL → Let's Encrypt → 申请 SSL 证书"
echo "4. 启动后端: cd $APP_DIR/server && pm2 start dist/index.js --name $APP_NAME"
echo ""
echo "🚀 使用 PM2 启动后端服务..."
npm install -g pm2
cd $APP_DIR/server
pm2 start dist/index.js --name $APP_NAME
pm2 save
pm2 startup
