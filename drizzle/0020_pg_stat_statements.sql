-- 按语句统计调用次数与耗时（DESIGN §21、docs/DEPLOY.md 第 3 节）；要服务器 db 容器带 shared_preload_libraries=pg_stat_statements 启动才有数据
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
