-- 删除 Asset 表（未使用的遗留代码）
-- 创建时间: 2026-01-17
-- 说明: Asset 表从未被前端使用，系统现在只使用 CanvasNode（画布节点）和 SavedAsset（资产仓库）

-- 删除 Asset 表
DROP TABLE IF EXISTS "assets";
