# Docker 命令 - AI Tools 项目

## 开发环境（热更新）
```bash
# 首次启动（需要构建）
docker compose -f docker-compose.dev.yml up --build

# 后续启动（无需重新构建）
docker compose -f docker-compose.dev.yml up

# 后台模式启动
docker compose -f docker-compose.dev.yml up -d

# 停止开发环境
docker compose -f docker-compose.dev.yml down
```
> 开发模式下修改 `src` 目录的代码会自动热更新，无需重新构建镜像。

## 生产环境
```bash
# 构建并启动所有服务
docker compose up --build

# 后台模式启动（分离模式）
docker compose up -d --build

# 重新构建特定服务
docker compose build api
```
> 生产模式下代码变动需要重新构建镜像。

## 停止和清理
```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（清空数据库）
docker compose down -v

# 删除所有容器、网络和镜像
docker compose down --rmi all -v
```

## 查看日志
```bash
# 查看所有日志
docker compose logs

# 实时跟踪日志
docker compose logs -f

# 查看特定服务的日志
docker compose logs api
docker compose logs db

# 实时跟踪特定服务
docker compose logs -f api
```

## 数据库命令
```bash
# 运行 Prisma 迁移
docker compose exec api npx prisma migrate dev

# 生成 Prisma 客户端
docker compose exec api npx prisma generate

# 打开 Prisma Studio
docker compose exec api npx prisma studio

# 重置数据库
docker compose exec api npx prisma migrate reset
```

## 容器管理
```bash
# 列出运行中的容器
docker compose ps

# 重启特定服务
docker compose restart api

# 在容器中执行命令
docker compose exec api sh

# 查看容器资源使用情况
docker stats
```

## 故障排查
```bash
# 检查容器是否运行
docker compose ps

# 进入容器内部
docker compose exec api sh

# 检查环境变量
docker compose exec api env

# 无缓存重新构建
docker compose build --no-cache

# 删除孤立容器
docker compose down --remove-orphans
```

## 修复 OpenSSL 问题
如果看到 "Error loading shared library libssl.so.1.1" 错误，Dockerfile 已更新包含 OpenSSL。重新构建：
```bash
docker compose down
docker compose up --build
```

## 内网转发
wsl hostname -I
netsh interface portproxy delete v4tov4 listenport=8686 listenaddress=172.16.16.109
netsh interface portproxy add v4tov4 listenport=8686 listenaddress=172.16.16.109 connectport=8686 connectaddress=172.22.226.220
curl.exe http://172.16.16.109:8686/api/models