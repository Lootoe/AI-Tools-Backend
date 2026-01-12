# 后端部署指南

## 一、服务器准备

### 1.1 系统要求
- Ubuntu 22.04
- Docker 26+
- Docker Compose V2+

### 1.2 开放端口
- 8686 (API)
- 5432 (PostgreSQL，可选，仅调试时开放)

---

## 二、部署步骤

### 2.1 克隆代码
```bash
mkdir -p /opt/ai-tools
cd /opt/ai-tools
git clone 你的后端仓库地址 backend
cd backend
```

### 2.2 配置环境变量
```bash
cp .env.example .env
nano .env
```

**必须修改的配置：**
```env
# 数据库密码（设置强密码）
DB_PASSWORD=YourStrongPassword123!

# CORS（改为你的服务器 IP）
CORS_ORIGIN=http://122.51.160.57

# JWT 密钥（随机字符串）
JWT_SECRET=随机字符串

# AI API
AI_API_KEY=你的API密钥

# 邮件配置
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=你的邮箱
SMTP_PASS=邮箱授权码
SMTP_FROM="喵想 <你的邮箱>"

# 七牛云
QINIU_ACCESS_KEY=你的AK
QINIU_SECRET_KEY=你的SK
QINIU_BUCKET=存储桶名
QINIU_DOMAIN=https://CDN域名
```

### 2.3 启动服务
```bash
docker compose up -d --build
```

### 2.4 验证
```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f api
```

---

## 三、常用命令

```bash
# 查看日志
docker compose logs -f api
docker compose logs -f db

# 重启
docker compose restart api

# 停止
docker compose down

# 重新构建
docker compose up -d --build

# 进入数据库
docker compose exec db psql -U postgres -d ai_tools
```

---

## 四、数据备份

```bash
# 备份
docker compose exec db pg_dump -U postgres ai_tools > backup_$(date +%Y%m%d).sql

# 恢复
cat backup.sql | docker compose exec -T db psql -U postgres ai_tools
```

---

## 五、更新部署

```bash
cd /opt/ai-tools/backend
git pull
docker compose up -d --build
```
