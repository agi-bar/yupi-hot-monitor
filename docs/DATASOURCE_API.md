# 数据源集成文档

## 概述

本系统支持多数据源集成，每个数据源都遵循统一的接口规范，具备以下核心能力：

- 统一的资源检索接口
- 数据拉取与格式化
- 鉴权与凭证管理
- 速率限制与自动重试
- 操作日志记录
- 配额监控

---

## 数据源列表

| ID | 名称 | 图标 | 状态 | 需要凭证 |
|----|------|------|------|---------|
| baidu | 百度搜索 | 🔍 | ✅ 可用 | 否 |
| douyin | 抖音搜索 | 🎵 | ⚙️ 需配置 | 是 (OAuth) |
| video-source | 视频号 | 📺 | ⚙️ 需配置 | 是 (OAuth) |
| xiaohongshu | 小红书 | 📕 | ✅ 可用 | 否 |
| sogou | 搜狗搜索 | 🔎 | ✅ 可用 | 否 |
| bilibili | Bilibili | 👁️ | ✅ 可用 | 否 |
| weibo | 微博热搜 | 📊 | ✅ 可用 | 否 |
| weixin | 微信搜一搜 | 💬 | ✅ 可用 | 否 |
| twitter | Twitter | 🐦 | ⚙️ 需配置 | 是 (API Key) |
| hackernews | HackerNews | ⚡ | ✅ 可用 | 否 |

---

## API 接口

### 获取所有数据源

```
GET /api/datasources
```

**响应示例：**
```json
[
  {
    "id": "baidu",
    "name": "百度搜索",
    "icon": "🔍",
    "enabled": true,
    "metrics": {
      "totalRequests": 100,
      "successfulRequests": 95,
      "failedRequests": 5,
      "avgLatency": 150
    },
    "health": {
      "status": "healthy",
      "latency": 120,
      "errorRate": 0.05
    }
  }
]
```

### 获取单个数据源详情

```
GET /api/datasources/:id
```

### 更新数据源配置

```
PUT /api/datasources/:id/config
```

**请求体：**
```json
{
  "enabled": true,
  "rateLimit": {
    "requestsPerMinute": 100,
    "requestsPerDay": 20000
  },
  "retry": {
    "maxRetries": 5,
    "retryDelayMs": 2000
  },
  "timeout": 45000
}
```

### 启用/停用数据源

```
PATCH /api/datasources/:id/toggle
```

**请求体：**
```json
{
  "enabled": false
}
```

### 获取数据源指标

```
GET /api/datasources/:id/metrics
```

### 获取操作日志

```
GET /api/datasources/:id/logs?limit=100
```

### 健康检查

```
POST /api/datasources/:id/health-check
```

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 404 | 数据源不存在 |
| 500 | 服务器错误 |

---

## 字段说明

### DataSourceConfig

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 数据源唯一标识 |
| name | string | 数据源名称 |
| enabled | boolean | 是否启用 |
| rateLimit.requestsPerMinute | number | 每分钟最大请求数 |
| rateLimit.requestsPerDay | number | 每天最大请求数 |
| retry.maxRetries | number | 最大重试次数 |
| retry.retryDelayMs | number | 重试延迟(毫秒) |
| timeout | number | 请求超时(毫秒) |

### DataSourceMetrics

| 字段 | 类型 | 说明 |
|------|------|------|
| totalRequests | number | 总请求数 |
| successfulRequests | number | 成功请求数 |
| failedRequests | number | 失败请求数 |
| totalLatency | number | 总延迟(毫秒) |
| avgLatency | number | 平均延迟(毫秒) |
| quotaUsed | number | 已使用配额 |
| quotaLimit | number | 配额上限 |

### DataSourceHealth

| 状态 | 说明 |
|------|------|
| healthy | 健康 |
| degraded | 性能下降 |
| unavailable | 不可用 |
| disabled | 已禁用 |

---

## 数据源配置

### 抖音 (douyin)

抖音需要 OAuth 2.0 认证。

**环境变量：**
```env
DOUYIN_API_KEY=your_client_key
DOUYIN_ACCESS_TOKEN=your_access_token
```

### 视频号 (video-source)

视频号需要微信公众号 API 权限。

**环境变量：**
```env
WECHAT_APP_ID=your_app_id
WECHAT_ACCESS_TOKEN=your_access_token
```

### 小红书 (xiaohongshu)

小红书无需 API Key，直接爬取网页内容。

---

## 扩展新数据源

### 1. 创建数据源类

```typescript
import { BaseDataSource } from './BaseDataSource.js';
import type { SearchOptions, SearchResult } from '../types/datasource.js';

export class MyDataSource extends BaseDataSource {
  readonly id = 'my-source';
  readonly name = '我的数据源';
  readonly icon = '🎯';
  
  protected async executeSearch(options: SearchOptions): Promise<SearchResult[]> {
    // 实现搜索逻辑
    const response = await this.httpClient.get('https://api.example.com/search', {
      params: { q: options.query }
    });
    
    return this.normalizeResults(response.data.items);
  }
  
  private normalizeResults(items: any[]): SearchResult[] {
    return items.map(item => ({
      title: item.title,
      content: item.description,
      url: item.url,
      source: this.id,
      publishedAt: new Date(item.createdAt)
    }));
  }
}
```

### 2. 注册数据源

在 `DataSourceManager` 中注册：

```typescript
import { MyDataSource } from './MyDataSource.js';

private registerDefaultSources(): void {
  // ... 其他数据源
  const mySource = new MyDataSource();
  this.sources.set('my-source', mySource);
}
```

### 3. 添加到热点检测

在 `hotspotChecker.ts` 中添加数据源调用。
