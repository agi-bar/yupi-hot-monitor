# Redis 分布式限流配置指南

## 问题描述

原始的限流器使用进程内内存存储请求记录，在多实例部署（如集群、K8s）时，无法跨实例统一限流，会导致总请求数超过限制。

## 解决方案

实现了基于 Redis 的分布式限流，支持自动回退到内存存储。

### 架构设计

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       v
┌──────────────────────────────────────┐
│     Express Server Instance 1        │
│  ┌────────────────────────────────┐  │
│  │  Rate Limit Middleware         │  │
│  │  ├─ Redis Enabled?              │  │
│  │  │  └─ Yes → Use Redis         │  │
│  │  │  └─ No → Fallback to Memory │  │
│  └────────────────────────────────┘  │
└────────────┬───────────────────────┘
             │
      ┌──────┴──────┐
      │             │
      v             v
┌──────────┐  ┌──────────┐
│  Redis   │  │ Memory   │
│ Server   │  │ (Local)  │
└──────────┘  └──────────┘
```

## 配置步骤

### 1. 安装 Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

**Docker:**
```bash
docker run -d -p 6379:6379 redis:latest
```

### 2. 配置环境变量

在 `.env.production` 中添加 Redis 连接 URL：

```env
REDIS_URL=redis://localhost:6379
```

如果是生产环境，可以使用带密码的 Redis：

```env
REDIS_URL=redis://:your-password@localhost:6379
```

### 3. 重启服务

```bash
npm run build
npm start
```

## 验证配置

### 检查限流存储类型

发送请求并检查响应头：

```bash
curl -I http://localhost:3001/api/health
```

如果配置正确，应该看到：

```
X-RateLimit-Storage: redis
```

### 测试分布式限流

1. 启动多个实例（不同端口）：
```bash
# Terminal 1
PORT=3001 npm start

# Terminal 2
PORT=3002 npm start
```

2. 向两个实例发送请求

3. 检查 Redis 中的限流数据：
```bash
redis-cli
> KEYS ratelimit:*
> GET ratelimit:127.0.0.1
```

## 工作原理

### Redis 模式

- 使用 Redis `INCR` + `EXPIRE` 实现原子操作
- 键名格式: `ratelimit:{IP}`
- 自动过期时间与限流窗口一致

### 内存回退模式

当 Redis 不可用或未配置时，自动回退到内存存储：
- 每个实例维护独立的计数
- 适合单实例部署
- 限流头显示: `X-RateLimit-Storage: memory`

## 响应头说明

| 响应头 | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 时间窗口内允许的最大请求数 |
| `X-RateLimit-Remaining` | 剩余可用请求数 |
| `X-RateLimit-Reset` | 限流窗口重置时间戳 |
| `X-RateLimit-Storage` | 存储类型: `redis` 或 `memory` |

## 故障排除

### Redis 连接失败

检查日志中的错误信息：

```
[ERROR] Redis: Connection error
```

解决方法：
1. 确认 Redis 服务正在运行: `redis-cli ping`
2. 检查防火墙设置
3. 验证 REDIS_URL 配置正确

### 限流失效

1. 检查响应头中的 `X-RateLimit-Storage` 值
2. 确认 Redis 中有对应的键: `redis-cli KEYS ratelimit:*`
3. 查看应用日志中的限流错误

## 生产环境建议

1. **使用 Redis 集群或哨兵模式** 提高可用性
2. **配置连接池和重试策略**
3. **监控 Redis 连接状态**
4. **设置合理的限流阈值**
5. **考虑使用滑动窗口算法** 替代固定窗口

## 性能考虑

- Redis 操作延迟: ~1ms
- 内存存储: ~0.01ms
- 性能差异可忽略不计
- 分布式一致性收益远大于性能损失
