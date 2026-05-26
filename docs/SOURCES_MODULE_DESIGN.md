# 来源管理模块技术设计文档

## 一、模块概述

来源管理模块是热点监控系统的核心组成部分，负责管理系统中的所有数据来源，包括社交媒体、搜索引擎、新闻网站等。该模块提供了完整的 CRUD 操作、统计报表、权限管理等功能，并与其他核心模块深度集成，实现数据链路全程追溯。

### 1.1 主要功能

- **来源信息管理**：新增、编辑、删除、查询来源信息
- **来源状态控制**：启用、暂停、错误标记
- **来源分类管理**：按类型、分类筛选和管理来源
- **使用统计展示**：实时统计请求量、成功率、错误率
- **权限精细配置**：支持角色级别的来源访问控制
- **批量导入导出**：支持 JSON 格式的批量操作
- **数据报表生成**：自动生成来源使用报表

### 1.2 核心特性

- RESTful API 设计
- 完整的分页和筛选
- 实时统计数据
- 关联热点数据追踪
- 角色权限控制
- 批量操作支持

---

## 二、数据库设计

### 2.1 数据模型

#### Source（来源）

| 字段名 | 类型 | 描述 | 示例 |
|--------|------|------|------|
| id | String | 主键 UUID | `"uuid-xxx"` |
| name | String | 来源名称（唯一） | `"Twitter API"` |
| type | String | 来源类型 | `"twitter"`, `"bing"`, `"google"` |
| category | String? | 分类 | `"social"`, `"search"`, `"news"` |
| status | String | 状态 | `"active"`, `"paused"`, `"error"` |
| priority | Int | 优先级 | `0`, `1`, `2` |
| description | String? | 描述 | `"官方 Twitter API 数据源"` |
| config | String? | JSON 配置 | `{"endpoint": "..."}` |
| credentials | String? | 加密凭证 | 存储 API Key 等 |
| totalRequests | Int | 总请求数 | `1000` |
| successCount | Int | 成功次数 | `950` |
| errorCount | Int | 错误次数 | `50` |
| lastUsedAt | DateTime? | 最后使用时间 | `2024-01-01T00:00:00Z` |
| isPublic | Boolean | 是否公开 | `true`, `false` |
| allowedRoles | String? | 允许的角色 | `["admin", "editor"]` |
| createdAt | DateTime | 创建时间 | 自动 |
| updatedAt | DateTime | 更新时间 | 自动 |

#### 索引

```prisma
@@index([type])
@@index([category])
@@index([status])
```

### 2.2 关联设计

```
Source 1:N Hotspot
```

每个来源可以关联多条热点数据，实现数据溯源。

---

## 三、API 设计

### 3.1 基础信息

- **Base URL**: `/api/sources`
- **Content-Type**: `application/json`
- **认证方式**: 预留（当前未实现）

### 3.2 接口列表

#### 3.2.1 获取来源列表

**GET** `/api/sources`

**Query Parameters**

| 参数 | 类型 | 必填 | 描述 | 默认值 |
|------|------|------|------|--------|
| page | string | 否 | 页码 | `"1"` |
| limit | string | 否 | 每页数量 | `"20"` |
| type | string | 否 | 来源类型筛选 | - |
| category | string | 否 | 分类筛选 | - |
| status | string | 否 | 状态筛选 | - |
| search | string | 否 | 关键词搜索 | - |
| sortBy | string | 否 | 排序字段 | `"createdAt"` |
| sortOrder | string | 否 | 排序方向 | `"desc"` |

**Response**

```json
{
  "data": [
    {
      "id": "uuid-xxx",
      "name": "Twitter API",
      "type": "twitter",
      "category": "social",
      "status": "active",
      "priority": 1,
      "totalRequests": 1000,
      "successCount": 950,
      "errorCount": 50,
      "hotspotCount": 150,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "stats": {
    "totalRequests": 10000,
    "successCount": 9500,
    "errorCount": 500
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

#### 3.2.2 获取单个来源

**GET** `/api/sources/:id`

**Response**

```json
{
  "id": "uuid-xxx",
  "name": "Twitter API",
  "type": "twitter",
  "category": "social",
  "status": "active",
  "description": "官方 Twitter API 数据源",
  "totalRequests": 1000,
  "successCount": 950,
  "errorCount": 50,
  "hotspotCount": 150,
  "importanceStats": [
    { "importance": "urgent", "_count": 5 },
    { "importance": "high", "_count": 20 },
    { "importance": "medium", "_count": 50 },
    { "importance": "low", "_count": 75 }
  ],
  "hotspots": [
    {
      "id": "hotspot-uuid",
      "title": "热点标题",
      "createdAt": "2024-01-01T00:00:00Z",
      "importance": "high"
    }
  ]
}
```

#### 3.2.3 创建来源

**POST** `/api/sources`

**Request Body**

```json
{
  "name": "Twitter API",
  "type": "twitter",
  "category": "social",
  "description": "官方 Twitter API 数据源",
  "config": {
    "endpoint": "https://api.twitter.com",
    "version": "v2"
  },
  "priority": 1,
  "isPublic": true,
  "allowedRoles": ["admin", "editor"]
}
```

**Response**: `201 Created`

```json
{
  "id": "uuid-xxx",
  "name": "Twitter API",
  ...
}
```

#### 3.2.4 更新来源

**PUT** `/api/sources/:id`

**Request Body**

```json
{
  "name": "Twitter API v2",
  "status": "paused",
  "priority": 2
}
```

**Response**: `200 OK`

#### 3.2.5 删除来源

**DELETE** `/api/sources/:id`

**Response**: `204 No Content`

#### 3.2.6 批量删除

**POST** `/api/sources/batch-delete`

**Request Body**

```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response**

```json
{
  "message": "Sources deleted successfully",
  "count": 3
}
```

#### 3.2.7 导出来源

**GET** `/api/sources/export`

**Response**: 文件下载（JSON 格式）

#### 3.2.8 导入来源

**POST** `/api/sources/import`

**Request Body**

```json
{
  "sources": [
    {
      "name": "Twitter API",
      "type": "twitter",
      "category": "social"
    }
  ]
}
```

**Response**

```json
{
  "success": 5,
  "failed": 1,
  "errors": ["Failed to import Google API: Duplicate name"]
}
```

#### 3.2.9 更新来源统计

**POST** `/api/sources/:id/stats`

**Request Body**

```json
{
  "type": "success",
  "increment": 1
}
```

`type` 可选值：`request`, `success`, `error`

**Response**

```json
{
  "totalRequests": 1001,
  "successCount": 951,
  "errorCount": 50,
  "successRate": "95.00%"
}
```

#### 3.2.10 获取来源报表

**GET** `/api/sources/:id/report?period=7d`

`period` 可选值：`1d`, `7d`, `30d`

**Response**

```json
{
  "period": "7d",
  "dateFrom": "2024-01-01T00:00:00Z",
  "dateTo": "2024-01-07T00:00:00Z",
  "summary": {
    "totalHotspots": 150,
    "avgPerDay": "21.43"
  },
  "timeline": [
    {
      "date": "2024-01-01",
      "total": 20,
      "byImportance": {
        "urgent": 2,
        "high": 5,
        "medium": 8,
        "low": 5
      }
    }
  ],
  "importanceDistribution": {
    "urgent": 15,
    "high": 40,
    "medium": 60,
    "low": 35
  },
  "topHotspots": [...]
}
```

---

## 四、功能关联设计

### 4.1 与热点模块关联

#### 数据链路

```
来源 → 热点抓取 → 热点存储
  ↑         ↓
  └──── 统计更新 ←┘
```

#### 实现机制

1. **来源参数带入**
   - 热点创建时自动关联 `sourceRecordId`
   - 来源信息自动填充到热点元数据

2. **统计数据同步**
   - 每次热点抓取成功 → 更新 `successCount`
   - 每次抓取失败 → 更新 `errorCount`
   - 实时更新 `totalRequests`

3. **数据溯源查询**
   - 支持按来源查询热点列表
   - 支持来源级别的数据统计

### 4.2 与权限系统关联

#### 权限模型

```typescript
interface SourcePermission {
  sourceId: string;
  roles: string[];
  isPublic: boolean;
}
```

#### 权限检查逻辑

```typescript
function canAccessSource(user: User, source: Source): boolean {
  if (source.isPublic) return true;
  
  const userRoles = getUserRoles(user);
  const allowedRoles = JSON.parse(source.allowedRoles || '[]');
  
  return userRoles.some(role => allowedRoles.includes(role));
}
```

### 4.3 与报表系统关联

#### 统计维度

- **时间维度**：按小时/天/周/月统计
- **来源维度**：各来源的数据贡献
- **重要性维度**：按紧急程度分类统计

#### 报表生成

- 自动聚合多来源数据
- 支持导出为 CSV/JSON
- 可视化图表展示

---

## 五、前端组件设计

### 5.1 组件结构

```
SourcesManager
├── Header (标题、操作按钮)
├── StatsCards (统计卡片)
├── Filters (筛选器)
├── SourcesList (来源列表)
│   └── SourceCard (来源卡片)
├── Pagination (分页)
└── SourceModal (编辑弹窗)
```

### 5.2 核心组件

#### SourcesManager

主容器组件，负责数据管理和状态控制。

#### SourceModal

编辑弹窗，支持新增和编辑两种模式。

### 5.3 状态管理

使用 React Hooks 本地状态管理：

```typescript
const [sources, setSources] = useState<Source[]>([]);
const [filters, setFilters] = useState<FilterState>({...});
const [pagination, setPagination] = useState({page: 1, totalPages: 1});
```

---

## 六、安全设计

### 6.1 输入验证

- 来源名称：必填、唯一性校验
- 来源类型：白名单验证
- 状态值：枚举验证
- 描述：长度限制（最大 1000 字符）

### 6.2 SQL 注入防护

- 使用 Prisma ORM 的参数化查询
- 避免字符串拼接 SQL

### 6.3 XSS 防护

- 前端输入转义
- 后端输出过滤

### 6.4 敏感信息

- API 密钥等凭证加密存储
- 导出时脱敏处理

---

## 七、性能优化

### 7.1 数据库优化

#### 索引策略

- 查询频率高的字段建立索引
- 复合索引优化组合查询

#### 查询优化

- 分页查询避免全表扫描
- 计数查询使用 `count()` 而非加载所有数据

### 7.2 API 优化

- 支持 `limit` 参数控制返回数据量
- 聚合统计一次性返回
- 缓存热点统计结果

### 7.3 前端优化

- 分页减少单次加载量
- 防抖处理搜索输入
- 骨架屏提升感知性能

---

## 八、错误处理

### 8.1 错误码

| 错误码 | 描述 | HTTP 状态码 |
|--------|------|-------------|
| SOURCE_NOT_FOUND | 来源不存在 | 404 |
| SOURCE_NAME_DUPLICATE | 来源名称重复 | 400 |
| INVALID_SOURCE_TYPE | 无效的来源类型 | 400 |
| INVALID_STATUS | 无效的状态值 | 400 |
| PERMISSION_DENIED | 权限不足 | 403 |

### 8.2 错误响应格式

```json
{
  "error": "SOURCE_NOT_FOUND",
  "message": "Source with id xxx not found"
}
```

---

## 九、测试策略

### 9.1 单元测试

- 来源 CRUD 操作
- 统计计算逻辑
- 权限验证逻辑
- 数据验证规则

### 9.2 集成测试

- API 端到端测试
- 数据库操作测试
- 多表关联测试

### 9.3 性能测试

- 并发请求压测
- 大数据量查询测试
- 响应时间基准测试

---

## 十、部署指南

### 10.1 前置条件

- Node.js >= 18.0.0
- PostgreSQL >= 14.0 或 SQLite
- npm 或 yarn

### 10.2 部署步骤

1. **数据库迁移**
   ```bash
   cd server
   npx prisma migrate deploy
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件
   ```

4. **启动服务**
   ```bash
   npm run dev  # 开发环境
   npm run build && npm start  # 生产环境
   ```

### 10.3 验证部署

```bash
# 健康检查
curl http://localhost:3001/api/health

# 获取来源列表
curl http://localhost:3001/api/sources
```

---

## 十一、版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 1.0.0 | 2024-01-01 | 初始版本，实现基础功能 |

---

## 附录

### A. 来源类型枚举

```typescript
const SOURCE_TYPES = [
  'twitter',    // Twitter
  'weibo',      // 微博
  'bing',       // Bing 搜索
  'google',     // Google 搜索
  'hackernews', // Hacker News
  'bilibili',   // Bilibili
  'weixin',     // 微信搜一搜
  'sogou',      // 搜狗搜索
  'duckduckgo'  // DuckDuckGo
];
```

### B. 来源状态枚举

```typescript
const SOURCE_STATUS = [
  'active',  // 启用
  'paused',  // 暂停
  'error'    // 错误
];
```

### C. 报表周期枚举

```typescript
const REPORT_PERIODS = [
  '1d',  // 1天
  '7d',  // 7天
  '30d'  // 30天
];
```

---

**文档版本**: v1.0  
**最后更新**: 2024-01-01  
**维护团队**: 热点监控系统开发组
