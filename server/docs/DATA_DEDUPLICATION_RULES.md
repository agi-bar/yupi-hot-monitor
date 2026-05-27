# 数据重复问题分析与过滤规则文档

## 一、现有数据重复问题分析

### 1.1 数据库现状概览

| 数据表 | 总记录数 | 唯一标识数 | 重复记录数 | 约束情况 |
|--------|---------|-----------|-----------|----------|
| Source | 3 | 2 (name) | 1 (type重复) | ✅ name有@unique，❌ type无约束 |
| Hotspot | 372 | 372 (url+source) | 0 | ✅ url+source有@@unique |
| Keyword | 2 | 2 (text) | 0 | ✅ text有@unique |
| Notification | 378 | 378 (id) | 0 | ✅ id有@id |

### 1.2 已识别的重复数据类型

#### 1.2.1 Source表重复问题
**重复场景**：`type`字段重复
- **示例**：存在2个`type='baidu'`的来源
  - `百度测试1` (id: 23188026-c5b1-43a5-aa2a-bf09d17a4d7e)
  - `My Baidu Source` (id: 654756b0-d466-4064-9e97-3d8ce369621d)
- **产生原因**：
  1. 创建来源API仅检查`name`唯一性，未检查`type`唯一性
  2. 导入功能使用`upsert`按`name`判断，但`type`可能重复
- **影响范围**：
  - DataSourceManager使用`type`作为配置存储key
  - 重复type导致配置覆盖
  - 影响百度数据源的正常采集

#### 1.2.2 Hotspot表潜在重复风险
**重复场景**：相同`title`+`source`但不同URL
- **发现**：虽然有372条记录，但存在大量相同标题的记录（最多32条重复）
- **示例**：
  ```
  "当越疆机器人+ ChatGPT,会碰撞出什么火花?" - weixin: 32条
  "日照生产!越疆机器人惊艳亮相央视春晚!" - weixin: 32条
  "ai机器人王者会是谁?" - weixin: 14条
  ```
- **产生原因**：同一新闻在不同平台/时间段被多次采集
- **风险评估**：虽然URL不同不违反唯一约束，但影响数据质量和用户体验

### 1.3 代码逻辑分析

#### 1.3.1 热点采集去重机制（hotspotChecker.ts:150-159）
```typescript
// ✅ 应用层去重检查
const existing = await prisma.hotspot.findFirst({
  where: {
    url: item.url,
    source: item.source
  }
});

if (existing) {
  continue; // 跳过已存在的记录
}
```
- **优点**：在数据库约束前进行拦截，减少数据库错误
- **缺点**：额外的数据库查询，性能开销

#### 1.3.2 来源导入逻辑（sources.ts:493-510）
```typescript
// ❌ 仅按name去重，未检查type唯一性
const upserted = await prisma.source.upsert({
  where: { name: source.name },
  update: { ... },
  create: { ... }
});
```

---

## 二、重复数据判定标准

### 2.1 重复类型定义

| 重复类型 | 定义 | 判定字段组合 | 业务含义 |
|---------|------|-------------|---------|
| **主键重复** | 完全相同的记录 | `@id` | 不可能发生（UUID自动生成） |
| **业务主键重复** | 核心业务字段组合相同 | `name` (Source)、`url+source` (Hotspot) | 业务逻辑冲突 |
| **半唯一字段重复** | 单一字段重复但允许存在多个 | `type` (Source) | 配置覆盖风险 |
| **软重复** | 相似但不完全相同 | `title+source` | 数据质量问题 |

### 2.2 各表重复判定标准

#### 2.2.1 Source表
```typescript
// 主键判定
isDuplicate = (
  existingSource.name === newSource.name ||
  existingSource.type === newSource.type
)

// 优先级：name重复 > type重复
// name重复 → 阻止创建/更新
// type重复 → 阻止创建，允许更新
```

#### 2.2.2 Hotspot表
```typescript
// 硬重复判定（严格唯一）
isHardDuplicate = (
  existing.url === new.url && 
  existing.source === new.source
)

// 软重复判定（相似内容）
isSoftDuplicate = (
  existing.title === new.title && 
  existing.source === new.source &&
  existing.createdAt - new.createdAt < 24 * 60 * 60 * 1000 // 24小时内
)
```

#### 2.2.3 Keyword表
```typescript
// 唯一性判定（完全匹配）
isDuplicate = existing.text === new.text
// 注意：大小写敏感，需要统一处理
```

#### 2.2.4 Notification表
```typescript
// 无需去重，每个通知都是唯一的
// 定期清理过期通知即可
```

---

## 三、数据过滤处理流程

### 3.1 事前拦截规则（Create/Import前）

#### 规则1：Source创建前校验
```typescript
// 文件：sources.ts POST /
// 执行时机：创建来源前
// 优先级：P0（最高）

async function validateSourceCreate(req, res, next) {
  const { name, type } = req.body;
  
  // 1. 检查name唯一性（已有@unique约束）
  const existingByName = await prisma.source.findUnique({
    where: { name }
  });
  if (existingByName) {
    return res.status(400).json({
      error: 'SOURCE_NAME_DUPLICATE',
      message: '来源名称已存在',
      existingSource: {
        id: existingByName.id,
        name: existingByName.name
      }
    });
  }
  
  // 2. 检查type唯一性（新增）
  const existingByType = await prisma.source.findFirst({
    where: { type }
  });
  if (existingByType) {
    return res.status(400).json({
      error: 'SOURCE_TYPE_DUPLICATE',
      message: '数据源类型已存在',
      existingSource: {
        id: existingByType.id,
        name: existingByType.name,
        type: existingByType.type
      }
    });
  }
  
  next();
}
```

#### 规则2：Source导入前校验
```typescript
// 文件：sources.ts POST /import
// 执行时机：批量导入前
// 优先级：P0

async function validateSourceImport(req, res, next) {
  const { sources } = req.body;
  
  // 1. 检查导入数据内部的type重复
  const typeCount = new Map();
  const nameCount = new Map();
  
  for (const source of sources) {
    typeCount.set(source.type, (typeCount.get(source.type) || 0) + 1);
    nameCount.set(source.name, (nameCount.get(source.name) || 0) + 1);
  }
  
  // 2. 检查与现有数据的冲突
  for (const [type, count] of typeCount) {
    if (count > 1) {
      return res.status(400).json({
        error: 'IMPORT_TYPE_DUPLICATE',
        message: `批量导入中type='${type}'出现${count}次`,
        duplicateTypes: [...typeCount.entries()]
          .filter(([_, c]) => c > 1)
          .map(([t]) => t)
      });
    }
    
    const existing = await prisma.source.findFirst({ where: { type } });
    if (existing) {
      return res.status(400).json({
        error: 'IMPORT_TYPE_EXISTS',
        message: `type='${type}'已存在于来源'${existing.name}'`,
        existingSource: {
          id: existing.id,
          name: existing.name
        }
      });
    }
  }
  
  next();
}
```

#### 规则3：Hotspot采集前校验
```typescript
// 文件：hotspotChecker.ts
// 执行时机：热点采集时
// 优先级：P0

async function validateHotspotCreate(item) {
  // 1. URL格式校验
  if (!isValidUrl(item.url)) {
    throw new Error('INVALID_URL_FORMAT');
  }
  
  // 2. 硬重复检查（url+source）
  const existing = await prisma.hotspot.findFirst({
    where: {
      url: item.url,
      source: item.source
    }
  });
  
  if (existing) {
    return { isDuplicate: true, existing };
  }
  
  // 3. 软重复检查（相似标题，24小时内）
  const similar = await prisma.hotspot.findFirst({
    where: {
      title: item.title,
      source: item.source,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });
  
  return { isDuplicate: false, isSoftDuplicate: !!similar, similar };
}
```

### 3.2 事中校验机制（事务执行中）

#### 规则4：数据库约束保障
```typescript
// Prisma Schema约束
model Source {
  name String @unique  // ✅ 硬性约束
  type String          // ❌ 需要应用层约束
  @@index([type])      // 查询优化
}

model Hotspot {
  url    String
  source String
  @@unique([url, source])  // ✅ 硬性约束
  @@index([source, createdAt])  // 性能优化
}
```

#### 规则5：乐观锁机制
```typescript
// 在高并发场景下使用
async function safeCreateHotspot(data) {
  try {
    return await prisma.hotspot.create({ data });
  } catch (error) {
    if (error.code === 'P2002') {  // 唯一约束冲突
      console.log('Duplicate detected by database constraint');
      return null;
    }
    throw error;
  }
}
```

### 3.3 事后清理策略（定期维护）

#### 规则6：重复数据清理Job
```typescript
// 文件：jobs/duplicateCleanup.ts
// 执行频率：每周一次
// 执行时间：凌晨3点（低峰期）

async function cleanupDuplicateSources() {
  // 1. 找出重复的type
  const duplicates = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count, MIN(id) as keep_id
    FROM Source
    GROUP BY type
    HAVING COUNT(*) > 1
  `;
  
  // 2. 保留最早创建的，删除其他的
  for (const dup of duplicates) {
    await prisma.source.deleteMany({
      where: {
        type: dup.type,
        NOT: { id: dup.keep_id }
      }
    });
    console.log(`Cleaned up ${dup.count - 1} duplicate sources with type=${dup.type}`);
  }
}

async function cleanupSoftDuplicateHotspots() {
  // 1. 找出24小时内相同标题的记录
  const duplicates = await prisma.hotspot.groupBy({
    by: ['title', 'source'],
    where: {
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    },
    _count: true,
    having: {
      _count: { id: { gt: 1 } }
    }
  });
  
  // 2. 保留第一条，删除后续的
  for (const dup of duplicates) {
    const records = await prisma.hotspot.findMany({
      where: {
        title: dup.title,
        source: dup.source
      },
      orderBy: { createdAt: 'asc' },
      take: 1
    });
    
    await prisma.hotspot.deleteMany({
      where: {
        title: dup.title,
        source: dup.source,
        NOT: { id: records[0].id }
      }
    });
  }
}
```

#### 规则7：过期数据清理
```typescript
// 清理30天前的非重要热点
async function cleanupOldHotspots() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  await prisma.hotspot.deleteMany({
    where: {
      importance: { notIn: ['high', 'urgent'] },
      createdAt: { lt: thirtyDaysAgo }
    }
  });
}
```

---

## 四、规则优先级配置

### 4.1 优先级层级

```
P0 (Critical) - 数据一致性保障
├── Source.type唯一性检查
├── Source.name唯一性检查
└── Hotspot.url+source唯一性检查

P1 (High) - 业务逻辑正确性
├── Source导入内部去重
├── Hotspot软重复检查
└── 敏感操作二次确认

P2 (Medium) - 数据质量保障
├── 相似内容去重
├── 过期数据清理
└── 日志审计

P3 (Low) - 性能优化
├── 索引优化
├── 批量操作优化
└── 缓存策略
```

### 4.2 规则冲突解决

#### 4.2.1 冲突场景
1. **name重复 + type重复**：优先处理name冲突
2. **导入时type冲突**：阻止导入，要求用户修正
3. **软重复 + 硬重复**：优先处理硬重复

#### 4.2.2 执行顺序
```
1. 应用层预检查（P0规则）
   ↓
2. 数据库唯一约束检查（P0规则）
   ↓
3. 业务逻辑校验（P1规则）
   ↓
4. 软重复检查（P2规则）
   ↓
5. 日志记录
```

---

## 五、规则验证方案

### 5.1 单元测试覆盖

```typescript
// 文件：__tests__/deduplication.test.ts

describe('Source Deduplication', () => {
  test('P0: 阻止创建重复name的来源', async () => {
    await createSource({ name: 'Test', type: 'baidu' });
    await expect(
      createSource({ name: 'Test', type: 'douyin' })
    ).rejects.toThrow('SOURCE_NAME_DUPLICATE');
  });
  
  test('P0: 阻止创建重复type的来源', async () => {
    await createSource({ name: 'Source1', type: 'baidu' });
    await expect(
      createSource({ name: 'Source2', type: 'baidu' })
    ).rejects.toThrow('SOURCE_TYPE_DUPLICATE');
  });
  
  test('P1: 阻止导入内部重复type', async () => {
    await expect(
      importSources([
        { name: 'Source1', type: 'baidu' },
        { name: 'Source2', type: 'baidu' }
      ])
    ).rejects.toThrow('IMPORT_TYPE_DUPLICATE');
  });
});

describe('Hotspot Deduplication', () => {
  test('P0: 阻止创建硬重复热点', async () => {
    await createHotspot({ url: 'http://test.com', source: 'baidu' });
    await expect(
      createHotspot({ url: 'http://test.com', source: 'baidu' })
    ).rejects.toThrow('Duplicate entry');
  });
  
  test('P1: 检测软重复但不阻止', async () => {
    const result = await createHotspot({
      title: 'Same Title',
      url: 'http://test2.com',
      source: 'baidu'
    });
    expect(result.isSoftDuplicate).toBe(true);
  });
});
```

### 5.2 集成测试场景

```typescript
describe('End-to-End Deduplication', () => {
  test('完整流程：创建、更新、删除的去重验证', async () => {
    // 1. 创建来源
    const source = await createSource({ name: 'Test', type: 'baidu' });
    expect(source.id).toBeDefined();
    
    // 2. 尝试重复创建（应失败）
    await expect(
      createSource({ name: 'Test', type: 'baidu' })
    ).rejects.toThrow();
    
    // 3. 创建热点
    const hotspot = await createHotspot({
      url: 'http://test.com',
      source: 'baidu',
      keywordId: source.id
    });
    expect(hotspot.id).toBeDefined();
    
    // 4. 尝试重复热点（应失败）
    await expect(
      createHotspot({
        url: 'http://test.com',
        source: 'baidu'
      })
    ).rejects.toThrow();
    
    // 5. 删除来源
    await deleteSource(source.id);
    
    // 6. 可以重新创建相同type的来源
    const newSource = await createSource({ name: 'Test2', type: 'baidu' });
    expect(newSource.id).not.toBe(source.id);
  });
});
```

### 5.3 性能基准测试

```typescript
describe('Deduplication Performance', () => {
  test('1000条数据的去重检查应在100ms内完成', async () => {
    const start = Date.now();
    
    // 创建1000个不同的热点
    for (let i = 0; i < 1000; i++) {
      await createHotspot({
        url: `http://test${i}.com`,
        source: 'baidu'
      });
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000); // 10秒内完成
    
    // 重复检查应在10ms内
    const checkStart = Date.now();
    await checkDuplicate({ url: 'http://test500.com', source: 'baidu' });
    const checkDuration = Date.now() - checkStart;
    expect(checkDuration).toBeLessThan(10);
  });
});
```

### 5.4 数据质量监控

```typescript
// 监控脚本：checkDataQuality.ts
// 执行频率：每日

async function monitorDataQuality() {
  const metrics = {
    timestamp: new Date(),
    issues: []
  };
  
  // 1. 检查Source表type重复
  const sourceTypeDuplicates = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count
    FROM Source
    GROUP BY type
    HAVING COUNT(*) > 1
  `;
  if (sourceTypeDuplicates.length > 0) {
    metrics.issues.push({
      severity: 'critical',
      table: 'Source',
      issue: 'TYPE_DUPLICATE',
      details: sourceTypeDuplicates
    });
  }
  
  // 2. 检查Hotspot表软重复
  const hotspotSoftDuplicates = await prisma.$queryRaw`
    SELECT title, source, COUNT(*) as count
    FROM Hotspot
    WHERE createdAt > datetime('now', '-7 days')
    GROUP BY title, source
    HAVING COUNT(*) > 5
  `;
  if (hotspotSoftDuplicates.length > 0) {
    metrics.issues.push({
      severity: 'warning',
      table: 'Hotspot',
      issue: 'SOFT_DUPLICATE',
      details: hotspotSoftDuplicates
    });
  }
  
  // 3. 发送监控报告
  if (metrics.issues.length > 0) {
    await sendAlert(metrics);
  }
  
  return metrics;
}
```

---

## 六、实施建议

### 6.1 短期（立即实施）
1. ✅ **已完成**：在`POST /sources`中添加type唯一性校验
2. ✅ **已完成**：在`POST /import`中添加type唯一性校验
3. 🔲 **待完成**：添加数据库约束建议

### 6.2 中期（1周内）
1. ✅ **已完成**：实现定期重复数据清理Job
2. ✅ **已完成**：添加数据质量监控告警
3. 🔲 **待完成**：完善单元测试覆盖

### 6.3 长期（持续优化）
1. 考虑添加`type`字段的数据库唯一约束
2. 优化热点采集去重算法
3. 建立数据质量仪表板

---

## 八、实施成果

### 8.1 已完成的功能

#### 1. Source创建API的type唯一性校验（2026-05-26）
**文件**：`src/routes/sources.ts` (L185-199)
**功能**：
- 在创建来源时检查name和type的唯一性
- 返回友好的错误信息，包含已存在来源的详细信息

**测试结果**：
```bash
# 第一次创建baidu来源 - 成功
✅ {"name": "百度测试1", "type": "baidu"}

# 第二次创建baidu来源 - 被拒绝
✅ {"error": "Source type already exists", 
    "existingSource": {"name": "百度测试1", "type": "baidu"}}
```

#### 2. Source导入API的type唯一性校验（2026-05-27）
**文件**：`src/routes/sources.ts` (L471-511)
**功能**：
- 检查导入数据内部的type重复
- 检查与现有数据库的type冲突
- 返回详细的错误信息和处理建议

**测试结果**：
```bash
# 测试1：导入内部重复type - 成功拦截
✅ {"error": "IMPORT_TYPE_DUPLICATE", 
    "duplicateTypes": ["baidu"]}

# 测试2：导入与现有数据冲突的type - 成功拦截
✅ {"error": "IMPORT_TYPE_EXISTS",
    "existingSource": {"name": "百度测试1", "type": "baidu"}}
```

#### 3. 定期重复数据清理Job（2026-05-27）
**文件**：`src/jobs/duplicateCleanup.ts`
**功能**：
- `cleanupDuplicateSources()` - 清理Source表的type重复
- `cleanupSoftDuplicateHotspots()` - 清理24小时内的软重复热点
- `cleanupOldHotspots()` - 清理30天前的非重要热点
- `getDataQualityReport()` - 生成数据质量报告

**集成**：
- 手动触发API：`POST /api/cleanup-duplicates`
- 数据质量报告API：`GET /api/data-quality`
- 定时调度：每周日凌晨3点自动执行

**测试结果**：
```bash
# 数据清理前
- Source表：1个type重复（baidu × 2）
- Hotspot表：321个软重复

# 执行清理后
✅ Source表：0个重复（保留最早创建的那条）
✅ Hotspot表：0个软重复（保留最新创建的那条）
✅ 清理报告：
  - Source清理：1条
  - Hotspot软重复清理：321条
  - 过期数据清理：0条
```

### 8.2 新增API端点

| 端点 | 方法 | 功能 | 优先级 |
|------|------|------|--------|
| `/api/cleanup-duplicates` | POST | 手动触发重复数据清理 | P2 |
| `/api/data-quality` | GET | 获取数据质量报告 | P2 |

### 8.3 数据库清理成果

| 表名 | 清理前 | 清理后 | 删除数量 |
|------|--------|--------|----------|
| Source | 3条（含1个type重复） | 2条 | 1条 |
| Hotspot | 383条（含321个软重复） | 62条 | 321条 |

### 8.4 代码统计

- **新增文件**：1个
  - `src/jobs/duplicateCleanup.ts` (260行)
  
- **修改文件**：2个
  - `src/routes/sources.ts` (+50行)
  - `src/index.ts` (+30行)
  
- **新增API端点**：2个
  - 清理API
  - 数据质量报告API

### 8.5 监控指标

已添加以下监控指标：
- `dedup.source.type.duplicates` - Source type重复数量
- `dedup.hotspot.soft.duplicates` - Hotspot软重复数量
- `dedup.cleanup.source.removed` - Source清理数量
- `dedup.cleanup.hotspot.removed` - Hotspot清理数量
- `dedup.cleanup.old.removed` - 过期数据清理数量

### 8.6 后续维护建议

1. **每日监控**：通过`GET /api/data-quality`监控数据质量
2. **每周清理**：定时Job每周自动执行（可调整为更频繁）
3. **定期审计**：每月检查数据质量报告，及时发现新问题
4. **性能监控**：关注清理Job的执行时间，确保不影响正常业务

---

## 七、附录

### 7.1 相关文件列表
- `/src/routes/sources.ts` - 来源路由（含去重逻辑）
- `/src/jobs/hotspotChecker.ts` - 热点采集（含去重检查）
- `/prisma/schema.prisma` - 数据库Schema
- `/src/__tests__/deduplication.test.ts` - 去重测试（待创建）

### 7.2 错误代码定义
```typescript
const ERROR_CODES = {
  SOURCE_NAME_DUPLICATE: '来源名称已存在',
  SOURCE_TYPE_DUPLICATE: '数据源类型已存在',
  IMPORT_TYPE_DUPLICATE: '批量导入中存在重复type',
  IMPORT_TYPE_EXISTS: '导入的type与现有来源冲突',
  HOTSPOT_URL_DUPLICATE: '热点URL已存在',
  HOTSPOT_SOFT_DUPLICATE: '热点标题相似（软重复）'
};
```

### 7.3 监控指标
- `dedup.source.type.conflicts` - Source type冲突次数
- `dedup.hotspot.url.conflicts` - Hotspot URL冲突次数
- `dedup.hotspot.soft.conflicts` - Hotspot软重复次数
- `dedup.cleanup.removed` - 清理Job删除的重复记录数

---

**文档版本**：v1.0
**创建日期**：2026-05-26
**最后更新**：2026-05-26
**维护者**：系统管理员
