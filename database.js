import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');
const dbPath = join(dataDir, 'bot.db');

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const SQL = await initSqlJs();

let db;
if (existsSync(dbPath)) {
  const data = readFileSync(dbPath);
  db = new SQL.Database(data);
} else {
  db = new SQL.Database();
}

function saveDb() {
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

// Save every 10 seconds
setInterval(saveDb, 10000);
process.on('exit', saveDb);
process.on('SIGINT', () => { saveDb(); process.exit(0); });
process.on('SIGTERM', () => { saveDb(); process.exit(0); });

db.run("CREATE TABLE IF NOT EXISTS guild_config (guild_id TEXT PRIMARY KEY, prefix TEXT DEFAULT '&', log_channel TEXT, welcome_channel TEXT, welcome_title TEXT, welcome_description TEXT, welcome_color TEXT DEFAULT '#FFD700', welcome_image TEXT, ticket_channel TEXT, ticket_category TEXT, ticket_role TEXT, ticket_emoji TEXT DEFAULT 'ticket', ticket_title TEXT, ticket_description TEXT, ticket_color TEXT DEFAULT '#FFD700', ticket_button_name TEXT DEFAULT 'Create Ticket', ticket_image TEXT, ticket_buttons TEXT DEFAULT '[]', antilink_enabled INTEGER DEFAULT 0, antinuke_enabled INTEGER DEFAULT 0, disabled_commands TEXT DEFAULT '[]', blacklist_words TEXT DEFAULT '[]')");

try {
  db.run("ALTER TABLE guild_config ADD COLUMN ticket_button_name TEXT DEFAULT 'Create Ticket'");
} catch (e) {}


  db.run(`CREATE TABLE IF NOT EXISTS reaction_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    role_id TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS temp_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS timers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    interval_ms INTEGER NOT NULL,
    next_run INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS invites (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    inviter_id TEXT,
    join_count INTEGER DEFAULT 0,
    leave_count INTEGER DEFAULT 0,
    fake_count INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
)`);

db.run(`CREATE TABLE IF NOT EXISTS invite_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT DEFAULT 'join'
)`);

db.run(`CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winners INTEGER DEFAULT 1,
    ends_at INTEGER NOT NULL,
    ended INTEGER DEFAULT 0,
    host_id TEXT NOT NULL,
    participants TEXT DEFAULT '[]'
)`);

db.run(`CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    timestamp INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    trigger TEXT NOT NULL,
    response TEXT NOT NULL,
    type TEXT DEFAULT 'message'
)`);

db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    closed INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS deleted_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_tag TEXT NOT NULL,
    content TEXT,
    timestamp INTEGER NOT NULL
)`);
saveDb();

// ─── Query Helpers ─────────────────────────────────────────────────────────────

function rowToObj(stmt, params = []) {
  const result = stmt.getAsObject(params);
  if (!result || Object.keys(result).length === 0) return null;
  return result;
}

function allRows(stmt, params = []) {
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.reset();
  return rows;
}

// Wrapper that mimics better-sqlite3 API
export const dbq = {
  prepare(sql) {
    const stmt = db.prepare(sql);
    return {
      get(...params) {
        stmt.bind(params);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.reset();
        return result;
      },
      all(...params) {
        const rows = [];
        stmt.bind(params);
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.reset();
        return rows;
      },
      run(...params) {
        stmt.run(params);
        saveDb();
        return { lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] };
      },
      reset() { stmt.reset(); }
    };
  },
  exec(sql) {
    db.run(sql);
    saveDb();
  },
  lastInsertRowid() {
    const res = db.exec('SELECT last_insert_rowid()');
    return res[0]?.values[0][0];
  }
};

export function getGuildConfig(guildId) {
  let row = dbq.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!row) {
    dbq.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
    row = dbq.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }
  if (!row) return { guild_id: guildId, prefix: '&', antilink_enabled: 0, antinuke_enabled: 0, disabled_commands: [], blacklist_words: [], ticket_buttons: [] };
  if (typeof row.ticket_buttons === 'string') { try { row.ticket_buttons = JSON.parse(row.ticket_buttons); } catch { row.ticket_buttons = []; } }
  if (typeof row.disabled_commands === 'string') { try { row.disabled_commands = JSON.parse(row.disabled_commands); } catch { row.disabled_commands = []; } }
  if (typeof row.blacklist_words === 'string') { try { row.blacklist_words = JSON.parse(row.blacklist_words); } catch { row.blacklist_words = []; } }
  return row;
}

export function setGuildConfig(guildId, data) {
  // Ensure guild exists
  dbq.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
  const keys = Object.keys(data);
  if (!keys.length) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => {
    const v = data[k];
    return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
  });
  dbq.prepare(`UPDATE guild_config SET ${setClause} WHERE guild_id = ?`).run(...values, guildId);
}

export default dbq;
