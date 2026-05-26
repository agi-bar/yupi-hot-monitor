# 宝塔面板 + 腾讯云 部署指南

本指南将帮助你使用宝塔面板将 HotMonitor 部署到腾讯云服务器。

## 环境要求

- 腾讯云服务器 (CentOS 7+)
- 宝塔面板 7.0+
- Node.js 18+ (推荐 20 LTS)
- PM2 (Node.js 进程管理器)
- 域名 (已备案)

---

## 第一步：服务器准备

### 1.1 安装宝塔面板（如果尚未安装）

```bash
# 腾讯云 CentOS 系统
yum install -y wget && wget -O install.sh http://download.bt.cn/install/install_6.0.sh && sh install.sh
```

### 1.2 安装必要软件

在宝塔面板中安装：
- **软件商店 → Node.js 版本管理器** → 安装 Node.js 20 LTS
- **软件商店 → PM2** → 安装

或通过 SSH 终端安装：

```bash
# 安装 Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# 安装 PM2
npm install -g pm2
```

---

## 第二步：上传代码

### 方式一：使用 Git（推荐）

```bash
cd /www/wwwroot
git clone https://github.com/agi-bar/yupi-hot-monitor.git hotmonitor
cd hotmonitor
```

### 方式二：使用宝塔面板上传

1. 打开宝塔面板 → 文件
2. 导航到 `/www/wwwroot`
3. 上传项目代码压缩包
4. 解压到 `hotmonitor` 目录

---

## 第三步：安装依赖和构建

### 3.1 安装后端依赖

```bash
cd /www/wwwroot/hotmonitor/server
npm install
npx prisma generate
```

### 3.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```bash
# 使用宝塔面板编辑
nano .env

# 或直接粘贴以下内容（请替换为你的真实配置）
```

**关键配置项**：
```env
# 数据库（SQLite 默认）
DATABASE_URL="file:./prod.db"

# 服务端口（保持 3001）
PORT=3001

# 前端访问地址（替换为你的域名）
CLIENT_URL=https://你的域名.com

# OpenRouter API（必需）
OPENROUTER_API_KEY=sk-or-v1-your-real-key

# 安全模式
NODE_ENV=production
```

### 3.3 初始化数据库

```bash
npx prisma db push
```

### 3.4 构建后端

```bash
npm run build
```

### 3.5 构建前端

```bash
cd /www/wwwroot/hotmonitor/client
npm install
npm run build
```

---

## 第四步：宝塔面板配置网站

### 4.1 添加网站

1. 宝塔面板 → 网站 → 添加站点
2. 填写信息：
   - 域名：`你的域名.com`（同时添加 `www.你的域名.com`）
   - 根目录：`/www/wwwroot/hotmonitor/client/dist`
   - PHP版本：选择"纯静态"

### 4.2 配置反向代理

1. 点击刚创建的网站 → 设置 → 反向代理 → 添加反向代理
2. 配置：
   - 代理名称：`api`
   - 目标URL：`http://127.0.0.1:3001`
   - 发送域名：`$host`
   - 启用高级功能：✓
   - 添加其他配置：
   ```
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```

### 4.3 申请 SSL 证书

1. 网站 → 设置 → SSL → Let's Encrypt
2. 勾选你的域名
3. 点击"申请"
4. 开启强制HTTPS

### 4.4 配置前端 API 地址

前端构建后需要修改 API 地址：

```bash
# 编辑前端配置文件
nano /www/wwwroot/hotmonitor/client/dist/assets/index-*.js
```

或在宝塔面板中直接编辑 `index.html`，确保包含正确的 API 地址。

---

## 第五步：启动后端服务

### 5.1 使用 PM2 启动

```bash
cd /www/wwwroot/hotmonitor/server
pm2 start dist/index.js --name hotmonitor
```

### 5.2 配置 PM2 开机自启

```bash
pm2 save
pm2 startup
```

### 5.3 查看服务状态

```bash
pm2 status
pm2 logs hotmonitor
```

---

## 第六步：验证部署

### 6.1 检查后端 API

```bash
curl http://localhost:3001/api/health
```

应返回：
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### 6.2 访问前端

在浏览器中访问：`https://你的域名.com`

### 6.3 测试功能

1. 添加一个监控关键词
2. 点击"立即扫描"
3. 检查是否有热点数据返回

---

## 常见问题

### Q1: 反向代理 502 错误

**原因**：后端服务未启动
```bash
pm2 restart hotmonitor
pm2 logs hotmonitor  # 查看日志
```

### Q2: API 请求跨域问题

**解决**：确保后端 `.env` 中 `CLIENT_URL` 正确设置为你访问的域名

### Q3: 数据库权限问题

```bash
chmod -R 755 /www/wwwroot/hotmonitor/server/prisma
chown -R www:www /www/wwwroot/hotmonitor
```

### Q4: 前端静态资源 404

**原因**：前端 dist 目录路径不正确
**解决**：确保网站根目录指向 `/www/wwwroot/hotmonitor/client/dist`

### Q5: PM2 无法启动

```bash
# 检查 Node 版本
node -v  # 需要 >= 18

# 手动测试
cd /www/wwwroot/hotmonitor/server
node dist/index.js
```

---

## 安全建议

### 1. 配置防火墙

```bash
# 开放必要端口
firewall-cmd --permanent --add-port=3001/tcp
firewall-cmd --reload
```

宝塔面板 → 安全 → 防火墙 → 开放端口

### 2. 设置 .gitignore

确保不上传敏感文件：

```gitignore
# 环境变量
.env
.env.local
.env.production

# 日志
*.log
npm-debug.log*

# PM2 日志
.pm2/
```

### 3. 定期备份

```bash
# 备份数据库
cp /www/wwwroot/hotmonitor/server/prisma/prod.db /www/backup/hotmonitor-$(date +%Y%m%d).db

# 宝塔面板 → 计划任务 → 添加备份任务
```

---

## 更新部署

当有新版本时：

```bash
cd /www/wwwroot/hotmonitor

# 拉取最新代码
git pull

# 重新安装依赖
cd server && npm install && npm run build
cd ../client && npm install && npm run build

# 重启服务
pm2 restart hotmonitor
```

---

## 技术支持

- 宝塔面板文档：https://www.bt.cn/bbs/
- PM2 文档：https://pm2.keymetrics.io/docs/usage/quick-start/
- 项目 Issues：https://github.com/agi-bar/yupi-hot-monitor/issues
