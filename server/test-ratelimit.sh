#!/bin/bash

echo "测试限流功能..."
echo ""

# 测试1: 初始请求
echo "测试1: 初始请求"
response=$(curl -s -I http://localhost:3001/api/health)
echo "$response" | grep -E "X-RateLimit-(Limit|Remaining|Storage)"
echo ""

# 测试2: 发送多个请求
echo "测试2: 发送5个并发请求"
for i in {1..5}; do
  curl -s -I http://localhost:3001/api/health > /dev/null
done

# 测试3: 检查剩余次数
echo "测试3: 检查限流计数"
response=$(curl -s -I http://localhost:3001/api/health)
remaining=$(echo "$response" | grep "X-RateLimit-Remaining" | awk '{print $2}')
limit=$(echo "$response" | grep "X-RateLimit-Limit" | awk '{print $2}')
storage=$(echo "$response" | grep "X-RateLimit-Storage" | awk '{print $2}')

echo "限流限制: $limit"
echo "剩余请求: $remaining"
echo "存储类型: $storage"
echo ""

if [ "$storage" = "memory" ]; then
  echo "✅ 当前使用内存存储 (适用于单实例部署)"
elif [ "$storage" = "redis" ]; then
  echo "✅ 当前使用Redis存储 (支持多实例分布式限流)"
fi

echo ""
echo "要启用Redis分布式限流:"
echo "1. 安装并启动Redis服务"
echo "2. 在 .env.production 中配置 REDIS_URL"
echo "3. 重启服务"
