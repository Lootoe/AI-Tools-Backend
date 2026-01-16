-- 添加画布名称字段和支持多画布
-- 1. 添加 name 字段（带默认值）
ALTER TABLE "canvases" ADD COLUMN "name" TEXT NOT NULL DEFAULT '画布 1';

-- 2. 删除 scriptId 的唯一约束
ALTER TABLE "canvases" DROP CONSTRAINT IF EXISTS "canvases_scriptId_key";

-- 3. 添加 scriptId 索引（如果不存在）
CREATE INDEX IF NOT EXISTS "canvases_scriptId_idx" ON "canvases"("scriptId");
