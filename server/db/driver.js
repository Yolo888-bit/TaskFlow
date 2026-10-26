/**
 * 数据库驱动适配层
 *
 * 优先使用 better-sqlite3（生态成熟、同步 API 性能好），但该包需要在安装时
 * 编译/下载原生二进制，部分网络环境下会失败。因此这里做了双驱动：
 *   1. better-sqlite3（package.json 中声明为 optionalDependencies，装不上也不阻塞）
 *   2. node:sqlite —— Node.js >= 22.5 内置的 SQLite 模块，零依赖
 *
 * 两者的常用 API 完全一致（db.exec / db.prepare(sql).run|get|all，
 * run() 返回 { changes, lastInsertRowid }），所以上层 DAO 无需感知差异。
 */
export async function openDatabase(dbPath) {
  try {
    const mod = await import('better-sqlite3');
    const Database = mod.default ?? mod;
    const db = new Database(dbPath);
    return { db, driver: 'better-sqlite3' };
  } catch (err) {
    console.warn(`[DB] better-sqlite3 不可用（${err.message}），回退到 Node 内置 node:sqlite`);
  }

  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    return { db, driver: 'node:sqlite (Node 内置)' };
  } catch (err) {
    throw new Error(
      `无法初始化 SQLite：better-sqlite3 与 node:sqlite 均不可用（${err.message}）。` +
        '请使用 Node.js >= 22.5，或在 server 目录执行 npm install 安装 better-sqlite3。'
    );
  }
}
