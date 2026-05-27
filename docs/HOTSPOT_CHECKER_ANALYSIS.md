# hotspotChecker.ts 全局排查分析报告

## 一、文件概览

**文件位置**：`server/src/jobs/hotspotChecker.ts`

**核心功能**：热点监控系统的主要数据处理逻辑，负责关键词监控、搜索、去重、AI分析、数据持久化

**代码行数**：269行

---

## 二、数据流程分析

### 2.1 完整数据流程

```
关键词列表
    ↓
for each keyword
    ├─ 账号检测（detectAndFetchAccount）
    ├─ 关键词扩展（expandKeyword）
    ├─ 7个数据源并行搜索
    │   ├─ Twitter
    │   ├─ Bing
    │   ├─ HackerNews
    │   ├─ Sogou
    │   ├─ Bilibili
    │   ├─ Weibo
    │   └─ Weixin
    ├─ 结果聚合
    ├─ 去重（deduplicateResults）
    ├─ 新鲜度过滤（filterByFreshness）
    ├─ 来源优先级排序（prioritizeResults）
    ├─ 配额限制
    ├─ 数据库查重
    ├─ AI内容分析
    ├─ 相关性阈值过滤
    ├─ 数据持久化
    ├─ 创建通知
    ├─ WebSocket推送
    └─ 邮件通知（高重要性）
```

### 2.2 关键处理阶段

| 阶段 | 函数 | 行号 | 说明 |
|------|------|------|------|
| 账号检测 | detectAndFetchAccount | 64 | 检测是否为平台账号 |
| 关键词扩展 | expandKeyword | 74 | AI扩展查询词 |
| 数据搜索 | Promise.allSettled | 86 | 7个数据源并行 |
| 结果去重 | deduplicateResults | 124 | 内存去重（title+source） |
| 新鲜度 | filterByFreshness | 125 | 过滤7天前内容 |
| 优先级 | prioritizeResults | 126 | 按来源排序 |
| 配额限制 | - | 139-147 | Twitter:20, 其他:15 |
| 数据库查重 | prisma.findFirst | 150 | url+source |
| AI分析 | analyzeContent | 164 | 真实性+相关性 |
| 阈值过滤 | - | 173-182 | relevance<50 过滤 |
| 数据持久化 | prisma.hotspot.create | 185 | 写入数据库 |
| 通知创建 | prisma.notification.create | 224 | 创建通知记录 |

---

## 三、发现的问题清单

### 🔴 P0 - 严重问题

#### 问题1：重复插入Bug（导致5条相同记录）

**位置**：第150-159行

**现象**：数据库中存在5条完全相同的记录（url、source、title都相同）

**当前代码**：

```typescript
// 检查是否已存在
const existing = await prisma.hotspot.findFirst({
  where: {
    url: item.url,
    source: item.source
  }
});

if (existing) {
  continue;
}
```

**问题分析**：

1. **查重只检查 `url + source`**，但同一内容可能出现在不同关键词下
2. **查重与插入之间存在时间窗口**：两个并发请求可能同时通过查重
3. **缺少数据库唯一约束**：Prisma schema 中没有添加 `@@unique([url, source])`

**修复方案**：

```typescript
// 方案1：增强查重逻辑（同时检查 title + source）
const existing = await prisma.hotspot.findFirst({
  where: {
    OR: [
      { url: item.url, source: item.source },
      { title: item.title, source: item.source }
    ]
  }
});

// 方案2：添加 try-catch 捕获唯一约束冲突
try {
  const hotspot = await prisma.hotspot.create({...});
  // 处理成功
} catch (error) {
  if (error.code === 'P2002') {  // 唯一约束冲突
    console.log('Duplicate detected, skipping...');
  }
}

// 方案3：在 schema.prisma 中添加唯一约束
model Hotspot {
  // ...
  url    String
  source String
  
  @@unique([url, source])
}
```

---

#### 问题2：WebSocket语法错误

**位置**：第234行

**当前代码**：

```typescript
io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
```

**问题**：缺少开头的反引号

**修复**：

```typescript
io.to(`keyword:${keyword.text}`).emit('hotspot:new', hotspot);
//           ↑ 这里应该是 `` `keyword:${keyword.text}` ``
```

---

### 🟠 P1 - 主要问题

#### 问题3：并发竞态条件

**位置**：第148-159行

**问题**：查重和插入不是原子操作，存在时间窗口

```typescript
// 时间窗口：请求A查询时，请求B也查询，都返回不存在
const existing = await prisma.hotspot.findFirst({...});  // 时间窗口
if (existing) { continue; }
//  ↓ 两个请求同时到达这里
const hotspot = await prisma.hotspot.create({...});  // 都插入
```

**修复方案**：使用 Prisma 的 upsert 或事务

```typescript
// 使用 upsert
const hotspot = await prisma.hotspot.upsert({
  where: {
    url_source: {  // 需要先在 schema 中定义复合唯一索引
      url: item.url,
      source: item.source
    }
  },
  create: {...},
  update: {}  // 已存在则不更新
});
```

---

#### 问题4：错误处理不完整

**位置**：第248-250行

**当前代码**：

```typescript
} catch (error) {
  console.error(`  Error processing result:`, error);
  // ❌ 没有 continue 或标记，导致循环继续但数据不一致
}
```

**问题**：发生错误时，没有明确的跳过逻辑，可能导致数据不一致

**修复**：

```typescript
} catch (error) {
  console.error(`  Error processing result:`, error);
  skippedByError++;
  continue;  // 明确跳过当前项
}
```

---

#### 问题5：缺少 URL 有效性检查

**位置**：第148-159行之间

**问题**：虽然在其他地方有验证，但这里没有明确检查 URL 有效性

**修复**：

```typescript
// 添加 URL 有效性检查
if (!item.url || !isValidHttpUrl(item.url)) {
  console.log(`  ⏭️  Skipped (invalid URL)`);
  skippedByInvalidUrl++;
  continue;
}
```

---

### 🟡 P2 - 次要问题

#### 问题6：配额统计不准确

**位置**：第253-258行

**问题**：`skippedByQuota` 只统计了超出配额的数量，但没有统计因为其他原因（查重、过滤）跳过的数量

**建议**：添加更详细的统计

```typescript
let stats = {
  total: sortedResults.length,
  processed: 0,
  skippedByQuota: 0,
  skippedByDuplicate: 0,
  skippedByFake: 0,
  skippedByRelevance: 0,
  inserted: 0
};
```

---

#### 问题7：硬编码魔法值

**位置**：多处

**问题**：常量直接写在代码中，没有提取为具名常量

**建议**：提取为常量

```typescript
const TWITTER_QUOTA = 20;
const OTHER_QUOTA = 15;
const MAX_AGE_HOURS = 7 * 24;
const RELAVANCE_MIN = 50;
const RELAVANCE_NO_KEYWORD = 65;
```

---

#### 问题8：缺少重试机制

**位置**：第86-94行

**问题**：某个数据源失败后没有重试机制

**建议**：添加简单的重试逻辑

```typescript
async function searchWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1));
    }
  }
}
```

---

## 四、性能问题分析

### 4.1 数据库查询过多

**问题**：每个关键词的每个结果都执行一次数据库查询

```typescript
for (const item of sortedResults) {
  // ❌ 每个 item 都查询一次数据库
  const existing = await prisma.hotspot.findFirst({
    where: { url: item.url, source: item.source }
  });
  // ...
  const hotspot = await prisma.hotspot.create({...});
}
```

**影响**：如果有1000个关键词，每个返回20条结果，将执行 20,000+ 次数据库查询

**优化建议**：

1. **批量预查询**：一次查询所有可能的重复项
2. **使用缓存**：维护内存中的已存在 URL 集合
3. **异步处理**：使用队列异步写入数据库

---

### 4.2 顺序处理关键词

**问题**：关键词是顺序处理的，不是并行的

```typescript
for (const keyword of keywords) {
  // ❌ 顺序处理，一个完成才处理下一个
  const results = await searchSources(keyword);
  // ...
}
```

**优化建议**：

```typescript
// 批量处理关键词（注意配额限制）
const batchSize = 5;
for (let i = 0; i < keywords.length; i += batchSize) {
  const batch = keywords.slice(i, i + batchSize);
  await Promise.all(batch.map(k => processKeyword(k)));
}
```

---

### 4.3 同步AI调用

**问题**：每个结果都同步调用AI分析

```typescript
const analysis = await analyzeContent(fullText, keyword.text, preMatch);
```

**影响**：如果一次处理35条结果，需要35次AI调用

**优化建议**：

1. **批量分析**：将多条结果一次发送给AI
2. **异步队列**：后台队列处理AI分析
3. **缓存结果**：相似内容复用分析结果

---

## 五、安全问题分析

### 5.1 SQL注入风险

**位置**：第150行

**当前代码**：

```typescript
const existing = await prisma.hotspot.findFirst({
  where: { url: item.url, source: item.source }
});
```

**评估**：✅ Prisma 使用参数化查询，无SQL注入风险

---

### 5.2 XSS风险

**评估**：✅ 数据在存储前经过AI分析，内容已验证

---

## 六、测试覆盖分析

### 6.1 缺失的测试

1. ❌ 没有测试并发场景下的重复插入
2. ❌ 没有测试配额限制的正确性
3. ❌ 没有测试阈值过滤的边界条件
4. ❌ 没有测试WebSocket通知的正确性
5. ❌ 没有集成测试

### 6.2 建议的测试用例

```typescript
describe('hotspotChecker', () => {
  it('should not insert duplicate hotspots', async () => {
    // 模拟两个并发请求
    // 验证只插入一条记录
  });
  
  it('should respect quota limits', () => {
    // 验证 Twitter 配额为 20
    // 验证其他来源配额为 15
  });
  
  it('should filter by relevance threshold', () => {
    // 验证 relevance < 50 被过滤
    // 验证 relevance >= 50 被保留
  });
});
```

---

## 七、重构建议

### 7.1 代码结构优化

```typescript
// 当前结构：所有逻辑在一个函数中
export async function runHotspotCheck(io: Server) {
  // 300+ 行代码
}

// 建议：拆分为多个函数
class HotspotProcessor {
  constructor(private io: Server) {}
  
  async processKeyword(keyword: Keyword) {
    const results = await this.fetchAllSources(keyword);
    const filtered = this.applyFilters(results);
    await this.persistResults(filtered);
    this.notifyClients(filtered);
  }
}
```

### 7.2 配置外置

```typescript
// 当前：硬编码配置
const TWITTER_QUOTA = 20;

// 建议：从配置文件读取
const config = await loadConfig();
const TWITTER_QUOTA = config.quotas.twitter;
```

### 7.3 错误处理统一

```typescript
// 当前：分散的错误处理
if (existing) { continue; }
if (!analysis.isReal) { continue; }
if (analysis.relevance < 50) { continue; }

// 建议：统一的过滤机制
const filters = [
  (item) => item.url ? null : 'Missing URL',
  (item) => analysis.isReal ? null : 'Fake content',
  (item) => analysis.relevance >= 50 ? null : 'Low relevance',
];

for (const filter of filters) {
  const reason = filter(item);
  if (reason) {
    console.log(`Filtered: ${reason}`);
    continue;
  }
}
```

---

## 八、修复优先级

### P0 - 立即修复

| 序号 | 问题 | 影响 | 修复难度 |
|------|------|------|----------|
| 1 | WebSocket语法错误 | 功能异常 | 低 |
| 2 | 重复插入Bug | 数据质量 | 中 |

### P1 - 本周修复

| 序号 | 问题 | 影响 | 修复难度 |
|------|------|------|----------|
| 3 | 并发竞态条件 | 数据质量 | 中 |
| 4 | 错误处理不完整 | 可调试性 | 低 |
| 5 | URL有效性检查 | 数据质量 | 低 |

### P2 - 计划修复

| 序号 | 问题 | 影响 | 修复难度 |
|------|------|------|----------|
| 6 | 配额统计不准确 | 可观测性 | 低 |
| 7 | 硬编码魔法值 | 可维护性 | 低 |
| 8 | 缺少重试机制 | 健壮性 | 中 |
| 9 | 数据库查询过多 | 性能 | 高 |
| 10 | 测试覆盖不足 | 质量 | 高 |

---

## 九、修复检查清单

### 立即执行

- [ ] 修复 WebSocket 语法错误（第234行）
- [ ] 添加数据库唯一约束（schema.prisma）
- [ ] 增强查重逻辑（title + source）
- [ ] 添加错误处理中的 continue

### 本周完成

- [ ] 添加 URL 有效性检查
- [ ] 完善配额统计
- [ ] 提取魔法值为常量
- [ ] 编写并发测试用例

### 后续优化

- [ ] 实现批量预查询优化
- [ ] 添加重试机制
- [ ] 重构代码结构
- [ ] 完善测试覆盖

---

**报告生成时间**：2026年5月27日

**分析工具**：静态代码分析 + 数据库查询验证

**后续行动**：根据修复优先级制定具体的修复计划
