import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 优先用 config 提供的 db 路径(它会读 XIAOHONGYI_USER_DATA 环境变量)
// 桌面版:数据落到 %APPDATA%\小红蚁\data\app.db
// Web 版:用项目内 data/app.db
const DB_PATH = config.paths.db;

// Sprint 5: tests can opt into an in-memory database by setting
// LITTLE_RED_ANT_TEST=1 (done in tests/setup.ts before any consumer imports).
// This avoids the need to vi.mock api/db.js from many different relative paths.
// When the test env var is set, we use a shared :memory: connection that
// survives across module imports within a single test process.
// SAFETY: if NODE_ENV=production, ignore this env var — data loss is unacceptable.
const isTest = process.env.LITTLE_RED_ANT_TEST === '1' && process.env.NODE_ENV !== 'production';

const dbPath = isTest ? ':memory:' : DB_PATH;
const db = new Database(dbPath, { timeout: 5000 }); // Increase busy timeout to 5s
if (!isTest) {
  db.pragma('journal_mode = WAL');
}
db.pragma('synchronous = NORMAL'); // Balance between safety and speed
db.pragma('busy_timeout = 5000'); // Explicitly set busy timeout

// Test mode: ensure all tables exist as soon as the module loads. In production
// this is handled explicitly by server.ts (which calls initDB() during boot),
// but tests that import the module directly need the schema ready immediately.
if (isTest) {
  // initDB is hoisted via the function declaration below; this runs synchronously
  // because better-sqlite3 is sync.
  initDB();
}

// Initialize tables
export function initDB() {
  console.log('Initializing database...');
  
  // User Table (Single user for MVP, or multiple based on id)
  // We'll assume a single user system for now or use a fixed ID for the "current user"
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      niche TEXT, -- 专注领域
      identity_tags TEXT, -- 身份标签 (JSON)
      style TEXT, -- 账号风格
      benchmark_accounts TEXT, -- 对标账号 (JSON)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add writing_samples to users
  try {
      const columns = db.prepare("PRAGMA table_info(users)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('writing_samples')) {
          console.log('Migrating users table: Adding writing_samples...');
          db.prepare("ALTER TABLE users ADD COLUMN writing_samples TEXT").run(); // JSON Array
      }

      if (!columnNames.includes('name')) {
          console.log('Migrating users table: Adding name...');
          db.prepare("ALTER TABLE users ADD COLUMN name TEXT DEFAULT '默认人设'").run();
      }

      if (!columnNames.includes('is_active')) {
          console.log('Migrating users table: Adding is_active...');
          db.prepare("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 0").run();
          // Set the latest one as active by default
          db.prepare("UPDATE users SET is_active = 1 WHERE id = (SELECT id FROM users ORDER BY id DESC LIMIT 1)").run();
      }
  } catch (e) {
      console.error('Migration users failed:', e);
  }

  // Drafts Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      tags TEXT, -- JSON array
      images TEXT, -- JSON array of image URLs
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add images to drafts
  try {
      const columns = db.prepare("PRAGMA table_info(drafts)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('images')) {
          console.log('Migrating drafts table: Adding images...');
          db.prepare("ALTER TABLE drafts ADD COLUMN images TEXT").run(); // JSON Array
      }
      if (!columnNames.includes('content_type')) {
          console.log('Migrating drafts table: Adding content_type...');
          db.prepare("ALTER TABLE drafts ADD COLUMN content_type TEXT DEFAULT 'note'").run(); // 'note', 'article', 'video_script'
      }
      if (!columnNames.includes('meta_data')) {
          console.log('Migrating drafts table: Adding meta_data...');
          db.prepare("ALTER TABLE drafts ADD COLUMN meta_data TEXT").run(); // JSON: { topic, keywords, style, remixStructure, customInstructions }
      }
      if (!columnNames.includes('scheduled_at')) {
          console.log('Migrating drafts table: Adding scheduled_at...');
          db.prepare("ALTER TABLE drafts ADD COLUMN scheduled_at DATETIME").run(); // 内容日历排期时间
      }
  } catch (e) {
      console.error('Migration drafts failed:', e);
  }

  // Accounts Table (For Matrix Management)
  // Updated Schema for Separate Cookies
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT,
      avatar TEXT,
      creator_cookies TEXT, -- Creator Center Session
      main_site_cookies TEXT, -- Main Site Session
      cookies TEXT, -- Legacy: kept for migration, will be deprecated
      profile_path TEXT, 
      is_active BOOLEAN DEFAULT 0,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Migration: Add new columns if not exist
  try {
    const columns = db.prepare("PRAGMA table_info(accounts)").all() as any[];
    const columnNames = columns.map(c => c.name);
    
    if (!columnNames.includes('creator_cookies')) {
        console.log('Migrating accounts table: Adding creator_cookies...');
        db.prepare('ALTER TABLE accounts ADD COLUMN creator_cookies TEXT').run();
        // Migrate legacy cookies to creator_cookies
        db.prepare('UPDATE accounts SET creator_cookies = cookies').run();
    }
    
    if (!columnNames.includes('main_site_cookies')) {
        console.log('Migrating accounts table: Adding main_site_cookies...');
        db.prepare('ALTER TABLE accounts ADD COLUMN main_site_cookies TEXT').run();
    }
  } catch (e) {
    console.error('Migration failed:', e);
  }

  // Migration: Add status column to accounts
  try {
      const columns = db.prepare("PRAGMA table_info(accounts)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('status')) {
          console.log('Migrating accounts table: Adding status...');
          db.prepare("ALTER TABLE accounts ADD COLUMN status TEXT DEFAULT 'UNKNOWN'").run(); // 'ACTIVE', 'EXPIRED', 'UNKNOWN'
      }
  } catch (e) {
      console.error('Migration accounts status failed:', e);
  }

  // Migration: Add alias to accounts
  try {
      const columns = db.prepare("PRAGMA table_info(accounts)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('alias')) {
          console.log('Migrating accounts table: Adding alias...');
          db.prepare("ALTER TABLE accounts ADD COLUMN alias TEXT").run();
      }
      if (!columnNames.includes('user_id')) {
          console.log('Migrating accounts table: Adding user_id...');
          db.prepare("ALTER TABLE accounts ADD COLUMN user_id TEXT").run();
      }

      // Persona Fields
      if (!columnNames.includes('persona_image_url')) {
          console.log('Migrating accounts table: Adding persona_image_url...');
          db.prepare("ALTER TABLE accounts ADD COLUMN persona_image_url TEXT").run();
      }
      if (!columnNames.includes('persona_desc')) {
          console.log('Migrating accounts table: Adding persona_desc...');
          db.prepare("ALTER TABLE accounts ADD COLUMN persona_desc TEXT").run();
      }
      if (!columnNames.includes('tone')) {
          console.log('Migrating accounts table: Adding tone...');
          db.prepare("ALTER TABLE accounts ADD COLUMN tone TEXT").run();
      }
      if (!columnNames.includes('writing_sample')) {
          console.log('Migrating accounts table: Adding writing_sample...');
          db.prepare("ALTER TABLE accounts ADD COLUMN writing_sample TEXT").run();
      }
      if (!columnNames.includes('niche')) {
          console.log('Migrating accounts table: Adding niche...');
          db.prepare("ALTER TABLE accounts ADD COLUMN niche TEXT").run();
      }
  } catch (e) {
      console.error('Migration accounts alias failed:', e);
  }

  // Note Statistics Table (Data Analytics)
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT, -- Xiaohongshu Note ID
      title TEXT,
      cover_image TEXT,
      views INTEGER DEFAULT 0, -- 阅读/小眼睛
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      collects INTEGER DEFAULT 0, -- 收藏
      shares INTEGER DEFAULT 0, -- 分享
      publish_date DATETIME, -- Note creation time
      account_id INTEGER,
      record_date DATETIME DEFAULT CURRENT_TIMESTAMP, -- Snapshot time
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // Migration: Add publish_date to note_stats if not exists
  try {
    const columns = db.prepare("PRAGMA table_info(note_stats)").all() as any[];
    const columnNames = columns.map(c => c.name);
    
    if (!columnNames.includes('publish_date')) {
        console.log('Migrating note_stats table: Adding publish_date...');
        db.prepare('ALTER TABLE note_stats ADD COLUMN publish_date DATETIME').run();
    }
    if (!columnNames.includes('xsec_token')) {
        console.log('Migrating note_stats table: Adding xsec_token...');
        db.prepare('ALTER TABLE note_stats ADD COLUMN xsec_token TEXT').run();
    }
  } catch (e) {
    console.error('Migration note_stats failed:', e);
  }

  // Note Statistics History Table (For Trend Charts)
  // Removed Foreign Key to avoid mismatch issues (note_id in note_stats is not UNIQUE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_stats_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT,
      competitor_id INTEGER, -- Added for filtering
      account_id INTEGER, -- Sprint 1: closed-loop writeback from PublishHandler
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      collects INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      record_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add account_id to note_stats_history if it pre-dates Sprint 1
  try {
      const columns = db.prepare("PRAGMA table_info(note_stats_history)").all() as any[];
      if (!columns.map((c: any) => c.name).includes('account_id')) {
          db.prepare("ALTER TABLE note_stats_history ADD COLUMN account_id INTEGER").run();
      }
  } catch (e) {
      console.error('Migration note_stats_history.account_id failed:', e);
  }

  // Migration: Fix Foreign Key Mismatch for existing table
  try {
      const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='note_stats_history'").get() as { sql: string };
      if (schema && schema.sql.includes('REFERENCES note_stats(note_id)')) {
          console.log('Fixing schema for note_stats_history...');
          db.transaction(() => {
              db.exec('ALTER TABLE note_stats_history RENAME TO note_stats_history_old');
              db.exec(`
                CREATE TABLE note_stats_history (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  note_id TEXT,
                  competitor_id INTEGER,
                  views INTEGER DEFAULT 0,
                  likes INTEGER DEFAULT 0,
                  comments INTEGER DEFAULT 0,
                  collects INTEGER DEFAULT 0,
                  shares INTEGER DEFAULT 0,
                  record_time DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `);
              db.exec('INSERT INTO note_stats_history (id, note_id, views, likes, comments, collects, shares, record_time) SELECT id, note_id, views, likes, comments, collects, shares, record_time FROM note_stats_history_old');
              db.exec('DROP TABLE note_stats_history_old');
          })();
          console.log('Schema fixed.');
      }
      
      // Check if competitor_id exists (for non-recreated tables)
      const columns = db.prepare("PRAGMA table_info(note_stats_history)").all() as any[];
      if (!columns.map(c => c.name).includes('competitor_id')) {
           console.log('Migrating note_stats_history: Adding competitor_id...');
           db.prepare("ALTER TABLE note_stats_history ADD COLUMN competitor_id INTEGER").run();
      }

  } catch (e) {
      console.error('Migration failed:', e);
  }

  // Task Queue Table (Async Operations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, -- UUID
      type TEXT NOT NULL, -- 'PUBLISH', 'SCRAPE', etc.
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
      payload TEXT, -- JSON arguments
      result TEXT, -- JSON result data
      error TEXT, -- Error message
      attempts INTEGER DEFAULT 0,
      scheduled_at DATETIME, -- Scheduled execution time (null = immediate)
      priority INTEGER DEFAULT 0, -- Higher value = Higher priority
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add scheduled_at to tasks if not exists
  try {
      const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('scheduled_at')) {
          console.log('Migrating tasks table: Adding scheduled_at...');
          db.prepare("ALTER TABLE tasks ADD COLUMN scheduled_at TEXT").run();
      }

      if (!columnNames.includes('attempts')) {
          console.log('Migrating tasks table: Adding attempts...');
          db.prepare("ALTER TABLE tasks ADD COLUMN attempts INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('progress')) {
          console.log('Migrating tasks table: Adding progress...');
          db.prepare("ALTER TABLE tasks ADD COLUMN progress INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('priority')) {
          console.log('Migrating tasks table: Adding priority...');
          db.prepare("ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('publish_attempt_id')) {
          console.log('Migrating tasks table: Adding publish_attempt_id...');
          db.prepare("ALTER TABLE tasks ADD COLUMN publish_attempt_id TEXT").run();
      }
  } catch (e) {
      console.error('Migration tasks failed:', e);
  }

  // Publish attempts are durable idempotency records. A unique account/content key
  // prevents the queue, a restart, or an unknown outcome from blindly re-submitting.
  db.exec(`
    CREATE TABLE IF NOT EXISTS publish_attempts (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      task_id TEXT,
      status TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    const columns = db.prepare("PRAGMA table_info(publish_attempts)").all() as any[];
    if (!columns.some(column => column.name === 'result')) {
      console.log('Migrating publish_attempts table: Adding result...');
      db.prepare('ALTER TABLE publish_attempts ADD COLUMN result TEXT').run();
    }
  } catch (e) {
    console.error('Migration publish_attempts failed:', e);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_publish_attempts_account_status
    ON publish_attempts (account_id, status)
  `);

  // Account Business Profile Table (P1.1 账号经营档案)
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_profiles (
      account_id INTEGER PRIMARY KEY,
      goals TEXT, -- JSON Array
      target_audience TEXT, -- JSON Object { identity, painPoints, misconceptions }
      unique_capabilities TEXT, -- JSON Array
      content_pillars TEXT, -- JSON Array [{ name, description, targetRatio }]
      expression_boundaries TEXT, -- JSON Array
      tone_style TEXT,
      brand_kit TEXT, -- JSON Object
      is_complete BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Research Evidence & Content Opportunities (P1.2 需求雷达与内容机会卡)
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_evidence (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      source_type TEXT NOT NULL, -- 'COMMENT', 'DM', 'NOTE', 'MANUAL'
      source_url TEXT,
      raw_text TEXT NOT NULL,
      pain_points TEXT, -- JSON Array
      desires TEXT, -- JSON Array
      author_nickname TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_opportunities (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target_audience TEXT NOT NULL,
      scenario TEXT NOT NULL,
      problem TEXT NOT NULL,
      unique_angle TEXT NOT NULL,
      content_format TEXT NOT NULL, -- 'CHECKLIST', 'CASE_STUDY', 'TUTORIAL', 'OPINION', 'COMPARISON', 'QA'
      expected_outcome TEXT NOT NULL, -- 'FAVORITE', 'TRUST', 'INQUIRY', 'DISCUSSION', 'VALIDATION'
      content_pillar TEXT,
      status TEXT NOT NULL DEFAULT 'IDEA', -- 'IDEA', 'ACCEPTED', 'DEFERRED', 'REJECTED'
      decision_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opportunity_id TEXT NOT NULL,
      evidence_id TEXT NOT NULL,
      role TEXT DEFAULT 'PRIMARY',
      FOREIGN KEY (opportunity_id) REFERENCES content_opportunities(id) ON DELETE CASCADE,
      FOREIGN KEY (evidence_id) REFERENCES research_evidence(id) ON DELETE CASCADE
    )
  `);

  // Content Packages Table (P1.3 内容包)
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_packages (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      opportunity_id TEXT,
      title TEXT NOT NULL,
      target_audience TEXT,
      core_value_proposition TEXT,
      key_points TEXT, -- JSON Array
      body_markdown TEXT NOT NULL,
      cover_title_options TEXT, -- JSON Array
      tags TEXT, -- JSON Array
      current_version INTEGER NOT NULL DEFAULT 1,
      linked_draft_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Content Package Versions Table (P1.3 内容包历史版本快照)
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_package_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      target_audience TEXT,
      core_value_proposition TEXT,
      key_points TEXT, -- JSON Array
      body_markdown TEXT NOT NULL,
      cover_title_options TEXT, -- JSON Array
      tags TEXT, -- JSON Array
      change_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Demand Radar Keyword Watches (P2.1 需求雷达关键词监控表)
  db.exec(`
    CREATE TABLE IF NOT EXISTS demand_radar_watches (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      category TEXT,
      target_audience TEXT,
      min_likes_threshold INTEGER DEFAULT 50,
      is_active BOOLEAN DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Note Reviews Table (P2.4 笔记复盘与反馈信号表)
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_reviews (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      note_id TEXT,
      title TEXT NOT NULL,
      published_at TEXT,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      collects INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      ctr_assessment TEXT, -- 'HIGH' | 'NORMAL' | 'LOW'
      interaction_assessment TEXT, -- 'HIGH' | 'NORMAL' | 'LOW'
      what_worked TEXT,
      what_failed TEXT,
      feedback_signals TEXT, -- JSON Array
      next_action_ideas TEXT, -- JSON Array
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Content Series & Series-Package Mapping (P3.2 系列专栏表)
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_series (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      target_pillar TEXT,
      planned_count INTEGER DEFAULT 5,
      status TEXT DEFAULT 'ACTIVE', -- 'PLANNING' | 'ACTIVE' | 'COMPLETED'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS series_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(series_id, package_id)
    )
  `);

  // Settings Table (Key-Value Store for Global Config)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Trends Table (Hot Search Cache)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trends (
      source TEXT PRIMARY KEY, -- 'weibo', 'baidu', 'zhihu', 'douyin'
      data TEXT, -- JSON Array
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Trending Notes Table (Rich Content for Gallery)
    db.exec(`
      CREATE TABLE IF NOT EXISTS trending_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT DEFAULT 'xiaohongshu',
        note_id TEXT UNIQUE, -- Original ID from platform, ensure uniqueness
        title TEXT,
        author_name TEXT,
        author_avatar TEXT,
        cover_url TEXT,
        note_url TEXT,
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        collects_count INTEGER DEFAULT 0,
        content TEXT, -- Full text content
        type TEXT, -- 'video' or 'image'
        tags TEXT, -- JSON Array
        analysis_result TEXT, -- JSON Object from AI
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add new metrics columns to trending_notes
    try {
        const columns = db.prepare("PRAGMA table_info(trending_notes)").all() as any[];
        const columnNames = columns.map(c => c.name);
        
        if (!columnNames.includes('comments_count')) {
            console.log('Migrating trending_notes table: Adding comments_count...');
            db.prepare("ALTER TABLE trending_notes ADD COLUMN comments_count INTEGER DEFAULT 0").run();
        }
        if (!columnNames.includes('collects_count')) {
            console.log('Migrating trending_notes table: Adding collects_count...');
            db.prepare("ALTER TABLE trending_notes ADD COLUMN collects_count INTEGER DEFAULT 0").run();
        }
        
        // Video Analysis Columns
        if (!columnNames.includes('transcript')) {
            console.log('Migrating trending_notes table: Adding transcript...');
            db.prepare("ALTER TABLE trending_notes ADD COLUMN transcript TEXT").run();
        }
        if (!columnNames.includes('ocr_content')) {
            console.log('Migrating trending_notes table: Adding ocr_content...');
            db.prepare("ALTER TABLE trending_notes ADD COLUMN ocr_content TEXT").run();
        }
        if (!columnNames.includes('video_meta')) {
            console.log('Migrating trending_notes table: Adding video_meta...');
            db.prepare("ALTER TABLE trending_notes ADD COLUMN video_meta TEXT").run();
        }
    } catch (e) {
        console.error('Migration trending_notes failed:', e);
    }

  // Comments Table (Interaction Management)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, -- Xiaohongshu Comment ID
      note_id TEXT,
      user_id TEXT,
      user_nickname TEXT,
      user_avatar TEXT,
      content TEXT,
      create_time DATETIME,
      like_count INTEGER DEFAULT 0,
      sub_comment_count INTEGER DEFAULT 0,
      parent_id TEXT, -- If it is a reply
      reply_status TEXT DEFAULT 'UNREAD', -- 'UNREAD', 'READ', 'REPLIED', 'IGNORED'
      account_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // Migration: Add intent and ai_reply_suggestion to comments
  try {
      const columns = db.prepare("PRAGMA table_info(comments)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('intent')) {
          console.log('Migrating comments table: Adding intent...');
          db.prepare("ALTER TABLE comments ADD COLUMN intent TEXT").run(); // 'PRAISE', 'COMPLAINT', 'INQUIRY', 'OTHER'
      }

      if (!columnNames.includes('ai_reply_suggestion')) {
          console.log('Migrating comments table: Adding ai_reply_suggestion...');
          db.prepare("ALTER TABLE comments ADD COLUMN ai_reply_suggestion TEXT").run();
      }

      if (!columnNames.includes('type')) {
          console.log('Migrating comments table: Adding type...');
          db.prepare("ALTER TABLE comments ADD COLUMN type TEXT DEFAULT 'COMMENT'").run(); // 'COMMENT', 'MENTION'
      }

      if (!columnNames.includes('root_note_id')) {
          console.log('Migrating comments table: Adding root_note_id...');
          db.prepare("ALTER TABLE comments ADD COLUMN root_note_id TEXT").run();
      }
  } catch (e) {
      console.error('Migration comments intent failed:', e);
  }

  // Competitors Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE, -- XHS User ID
      nickname TEXT,
      avatar TEXT,
      latest_notes TEXT, -- JSON Array of recent notes
      analysis_result TEXT, -- AI Analysis
      fans_count INTEGER DEFAULT 0,
      notes_count INTEGER DEFAULT 0,
      likes_count INTEGER DEFAULT 0,
      last_updated DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add columns to competitors if not exists
  try {
      const columns = db.prepare("PRAGMA table_info(competitors)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('last_updated')) {
          console.log('Migrating competitors table: Adding last_updated...');
          db.prepare("ALTER TABLE competitors ADD COLUMN last_updated DATETIME").run();
      }
      if (!columnNames.includes('latest_notes')) {
          console.log('Migrating competitors table: Adding latest_notes...');
          db.prepare("ALTER TABLE competitors ADD COLUMN latest_notes TEXT").run();
      }
      if (!columnNames.includes('analysis_result')) {
          console.log('Migrating competitors table: Adding analysis_result...');
          db.prepare("ALTER TABLE competitors ADD COLUMN analysis_result TEXT").run();
      }
      if (!columnNames.includes('fans_count')) {
          console.log('Migrating competitors table: Adding fans_count...');
          db.prepare("ALTER TABLE competitors ADD COLUMN fans_count INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('notes_count')) {
          console.log('Migrating competitors table: Adding notes_count...');
          db.prepare("ALTER TABLE competitors ADD COLUMN notes_count INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('status')) {
          console.log('Migrating competitors table: Adding status...');
          db.prepare("ALTER TABLE competitors ADD COLUMN status TEXT DEFAULT 'active'").run(); // 'active', 'pending', 'refreshing', 'error'
      }
      if (!columnNames.includes('last_error')) {
          console.log('Migrating competitors table: Adding last_error...');
          db.prepare("ALTER TABLE competitors ADD COLUMN last_error TEXT").run();
      }
      if (!columnNames.includes('desc')) {
          console.log('Migrating competitors table: Adding desc...');
          db.prepare("ALTER TABLE competitors ADD COLUMN desc TEXT").run();
      }
      if (!columnNames.includes('likes_count')) {
          console.log('Migrating competitors table: Adding likes_count...');
          db.prepare("ALTER TABLE competitors ADD COLUMN likes_count INTEGER DEFAULT 0").run();
      }
  } catch (e) {
      console.error('Migration competitors failed:', e);
  }

  // Competitor Notes Table (Normalized Data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitor_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      note_id TEXT, -- Optional, parsed from URL
      title TEXT,
      cover TEXT,
      url TEXT,
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      collects INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      content TEXT,
      tags TEXT, -- JSON Array
      publish_date TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add rich fields to competitor_notes if not exists
  try {
      const columns = db.prepare("PRAGMA table_info(competitor_notes)").all() as any[];
      const columnNames = columns.map(c => c.name);

      if (!columnNames.includes('comments')) {
          console.log('Migrating competitor_notes table: Adding comments...');
          db.prepare("ALTER TABLE competitor_notes ADD COLUMN comments INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('collects')) {
          console.log('Migrating competitor_notes table: Adding collects...');
          db.prepare("ALTER TABLE competitor_notes ADD COLUMN collects INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('views')) {
          console.log('Migrating competitor_notes table: Adding views...');
          db.prepare("ALTER TABLE competitor_notes ADD COLUMN views INTEGER DEFAULT 0").run();
      }
      if (!columnNames.includes('content')) {
          console.log('Migrating competitor_notes table: Adding content...');
          db.prepare("ALTER TABLE competitor_notes ADD COLUMN content TEXT").run();
      }
      if (!columnNames.includes('tags')) {
          console.log('Migrating competitor_notes table: Adding tags...');
          db.prepare("ALTER TABLE competitor_notes ADD COLUMN tags TEXT").run(); // JSON Array
      }
  } catch (e) {
      console.error('Migration competitor_notes failed:', e);
  }

  // Competitor Stats History (For Trends)
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitor_stats_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competitor_id INTEGER NOT NULL,
      fans_count INTEGER DEFAULT 0,
      notes_count INTEGER DEFAULT 0,
      likes_count INTEGER DEFAULT 0, -- Total likes
      record_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
    )
  `);

  // Admin Users Table (For System Login)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin', -- 'admin', 'editor', 'viewer'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add alias / permissions / is_active / updated_at / password_changed_at to admin_users
  try {
      const columns = db.prepare("PRAGMA table_info(admin_users)").all() as any[];
      const columnNames = columns.map(c => c.name);

      if (!columnNames.includes('alias')) {
          console.log('Migrating admin_users table: Adding alias...');
          db.prepare("ALTER TABLE admin_users ADD COLUMN alias TEXT").run();
      }

      if (!columnNames.includes('permissions')) {
          console.log('Migrating admin_users table: Adding permissions...');
          db.prepare("ALTER TABLE admin_users ADD COLUMN permissions TEXT").run(); // JSON Array
      }

      if (!columnNames.includes('is_active')) {
          console.log('Migrating admin_users table: Adding is_active...');
          // 默认 1（启用），id=1（根管理员）永远保持启用
          db.prepare("ALTER TABLE admin_users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1").run();
      }

      if (!columnNames.includes('updated_at')) {
          console.log('Migrating admin_users table: Adding updated_at...');
          db.prepare("ALTER TABLE admin_users ADD COLUMN updated_at DATETIME").run();
      }

      if (!columnNames.includes('password_changed_at')) {
          console.log('Migrating admin_users table: Adding password_changed_at...');
          db.prepare("ALTER TABLE admin_users ADD COLUMN password_changed_at DATETIME").run();
      }

      if (!columnNames.includes('password_version')) {
          console.log('Migrating admin_users table: Adding password_version...');
          db.prepare("ALTER TABLE admin_users ADD COLUMN password_version INTEGER NOT NULL DEFAULT 1").run();
      }
  } catch (e) {
      console.error('Migration admin_users failed:', e);
  }

  // Login Attempts Table (Brute-force protection)
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      username TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      locked_until DATETIME,
      last_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Prompt Templates Table (For Custom AI Styles)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL, -- e.g. "发疯文学"
      description TEXT,
      template TEXT NOT NULL, -- The system prompt content
      is_default BOOLEAN DEFAULT 0,
      version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add version to prompt_templates
  try {
      const columns = db.prepare("PRAGMA table_info(prompt_templates)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('version')) {
          console.log('Migrating prompt_templates table: Adding version...');
          db.prepare("ALTER TABLE prompt_templates ADD COLUMN version INTEGER DEFAULT 1").run();
      }
  } catch (e) {
      console.error('Migration prompt_templates version failed:', e);
  }

  // Notifications Table (System Alerts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'SUCCESS', 'WARNING', 'ERROR', 'INFO'
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Prompt Optimizations Table (AI Feedback Loop)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_optimizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_template_id INTEGER,
      target_style TEXT,
      analysis_report TEXT, -- AI Analysis of why previous prompts worked/failed
      optimized_template TEXT, -- The new suggested template
      performance_metrics TEXT, -- JSON: { avg_views: 1000, avg_likes: 50 }
      status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPLIED', 'REJECTED'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Init Default Prompts
  try {
      const count = db.prepare('SELECT COUNT(*) as c FROM prompt_templates').get() as { c: number };
      if (count.c === 0) {
          console.log('Initializing default prompt templates...');
          const defaults = [
              { name: '干货实用', desc: '结构清晰，强调价值', tpl: '你是一个知识分享博主。风格要求：逻辑严密，干货满满，分点论述，多用✅📌等图标。拒绝废话。' },
              { name: '闺蜜唠嗑', desc: '亲切自然，情感共鸣', tpl: '你是一个邻家大姐姐。风格要求：像和闺蜜聊天一样，多用“宝子们”、“咱就是说”，语气亲切，情感充沛。' },
              { name: '疯狂安利', desc: '情绪激动，强力推荐', tpl: '你是一个带货达人。风格要求：情绪非常激动，多用感叹号！！！多用“绝绝子”、“真的哭死”、“按头安利”。' },
              { name: '清冷高级', desc: '极简主义，高冷范儿', tpl: '你是一个高冷的生活美学家。风格要求：文字极简，惜字如金。多用短句。不使用浮夸的表情。' },
              // Promo Templates
              { name: 'promo_lazy_mom', desc: '推广-懒人宝妈风', tpl: '你是一个既要带娃又要搞副业的95后宝妈。语气要求：真诚分享、感同身受、稍微带点焦虑但最后给出解决方案。多用Emoji。核心卖点：不费脑、自动干活、解放双手。禁止词汇：脚本、爬虫、RPA。' },
              { name: 'promo_matrix_op', desc: '推广-矩阵运营风', tpl: '你是一个资深的自媒体运营操盘手。语气要求：专业、犀利、讲效率。核心卖点：闭环系统、批量生产、无人值守、矩阵管理。禁止词汇：脚本、爬虫、RPA。' },
              // System Prompts
              { name: 'article_gen', desc: '深度长文生成', tpl: '你是一个资深的公众号/专栏作家。你的任务是根据用户的人设和选题，创作一篇**深度长文 (Long-form Article)**。' },
              { name: 'video_script_gen', desc: '分镜脚本生成', tpl: '你是一个专业的短视频导演和脚本编剧，精通镜头语言和视听叙事。' },
              { name: 'note_gen_standard', desc: '标准笔记生成', tpl: '你是一个拥有百万粉丝的小红书爆款文案专家。你的任务是根据用户的账号人设和选题，创作一篇高质量的小红书笔记。' },
              { name: 'video_prompt_optimizer', desc: '视频提示词优化', tpl: '你是一个专业的 AI 视频提示词工程专家。你的任务是将用户提供的模糊、简单的视频创意，优化为结构完整、细节丰富的 AI 视频生成提示词。' },
              { name: 'compliance_fixer', desc: '合规内容修复', tpl: '你是一个专业的内容合规审核与优化专家。你的任务是修改用户提供的内容，替换掉其中的违规敏感词。' }
          ];
          const stmt = db.prepare('INSERT INTO prompt_templates (name, description, template, is_default) VALUES (?, ?, ?, 1)');
          defaults.forEach(d => stmt.run(d.name, d.desc, d.tpl));
      }
  } catch(e) { console.error('Init prompts failed', e); }

  // Video Projects Table (For Persistent Video Assembly)
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_projects (
      id TEXT PRIMARY KEY, -- UUID
      title TEXT,
      script_content TEXT, -- JSON Structure of the script
      status TEXT DEFAULT 'DRAFT', -- 'DRAFT', 'GENERATING', 'COMPLETED'
      final_video_url TEXT, -- Stitched video result
      created_by INTEGER, -- admin_users.id — Sprint 8: IDOR fix
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add final_video_url to video_projects
  try {
      const columns = db.prepare("PRAGMA table_info(video_projects)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('final_video_url')) {
          console.log('Migrating video_projects table: Adding final_video_url...');
          db.prepare("ALTER TABLE video_projects ADD COLUMN final_video_url TEXT").run();
      }
      if (!columnNames.includes('bgm_url')) {
          console.log('Migrating video_projects table: Adding bgm_url...');
          db.prepare("ALTER TABLE video_projects ADD COLUMN bgm_url TEXT").run();
      }
      if (!columnNames.includes('character_desc')) {
          console.log('Migrating video_projects table: Adding character_desc...');
          db.prepare("ALTER TABLE video_projects ADD COLUMN character_desc TEXT").run();
      }
      if (!columnNames.includes('tags')) {
          console.log('Migrating video_projects table: Adding tags...');
          db.prepare("ALTER TABLE video_projects ADD COLUMN tags TEXT").run(); // JSON Array
      }
      if (!columnNames.includes('description')) {
          console.log('Migrating video_projects table: Adding description...');
          db.prepare("ALTER TABLE video_projects ADD COLUMN description TEXT").run();
      }
      if (!columnNames.includes('publish_status')) {
        console.log('Migrating video_projects table: Adding publish_status...');
        db.prepare("ALTER TABLE video_projects ADD COLUMN publish_status TEXT DEFAULT 'UNPUBLISHED'").run(); // UNPUBLISHED, PUBLISHING, PUBLISHED, FAILED
      }
      if (!columnNames.includes('publish_task_id')) {
        console.log('Migrating video_projects table: Adding publish_task_id...');
        db.prepare("ALTER TABLE video_projects ADD COLUMN publish_task_id TEXT").run();
      }
      if (!columnNames.includes('note_id')) {
        console.log('Migrating video_projects table: Adding note_id...');
        db.prepare("ALTER TABLE video_projects ADD COLUMN note_id TEXT").run();
      }
      if (!columnNames.includes('created_by')) {
        console.log('Migrating video_projects table: Adding created_by (IDOR fix)...');
        db.prepare("ALTER TABLE video_projects ADD COLUMN created_by INTEGER").run();
      }
  } catch (e) {
      console.error('Migration video_projects failed:', e);
  }

  // Video Scenes Table (Individual Clips)
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_scenes (
      id TEXT PRIMARY KEY, -- UUID
      project_id TEXT NOT NULL,
      scene_index INTEGER NOT NULL,
      script_visual TEXT,
      script_audio TEXT,
      status TEXT DEFAULT 'PENDING', -- 'PENDING', 'GENERATING', 'COMPLETED', 'FAILED'
      video_url TEXT,
      audio_url TEXT, -- TTS result
      duration REAL, -- Exact duration in seconds
      task_id TEXT, -- Associated generation task ID
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES video_projects(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add audio_url and duration to video_scenes
  try {
      const columns = db.prepare("PRAGMA table_info(video_scenes)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('audio_url')) {
          console.log('Migrating video_scenes table: Adding audio_url and duration...');
          db.prepare("ALTER TABLE video_scenes ADD COLUMN audio_url TEXT").run();
          db.prepare("ALTER TABLE video_scenes ADD COLUMN duration REAL").run();
      }
  } catch (e) {
      console.error('Migration video_scenes failed:', e);
  }

  // Assets Table (User Uploads)
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, -- UUID
      user_id TEXT, -- Optional owner
      type TEXT NOT NULL, -- 'audio', 'image', 'video'
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      size INTEGER,
      mime_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Compliance Rules Table (Risk Control)
  db.exec(`
    CREATE TABLE IF NOT EXISTS compliance_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, -- 'forbidden', 'sensitive', 'ad', 'medical', 'custom'
      keyword TEXT UNIQUE NOT NULL,
      level TEXT NOT NULL, -- 'BLOCK', 'WARN'
      suggestion TEXT,
      is_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Add updated_at to compliance_rules
  try {
      const columns = db.prepare("PRAGMA table_info(compliance_rules)").all() as any[];
      const columnNames = columns.map(c => c.name);
      
      if (!columnNames.includes('updated_at')) {
          console.log('Migrating compliance_rules table: Adding updated_at...');
          // SQLite limitation: Cannot add column with dynamic default like CURRENT_TIMESTAMP
          db.prepare("ALTER TABLE compliance_rules ADD COLUMN updated_at DATETIME").run();
      }
  } catch (e) {
      console.error('Migration compliance_rules failed:', e);
  }

  // --- Final Consistency Checks (For P0 Closed Loop) ---
  try {
      // 1. Fix drafts table for Feedback Loop
      const draftCols = db.prepare("PRAGMA table_info(drafts)").all().map((c: any) => c.name);
      if (!draftCols.includes('published_note_id')) {
          console.log('Migrating drafts: Adding published_note_id...');
          db.prepare("ALTER TABLE drafts ADD COLUMN published_note_id TEXT").run();
      }
      if (!draftCols.includes('published_url')) {
          console.log('Migrating drafts: Adding published_url...');
          db.prepare("ALTER TABLE drafts ADD COLUMN published_url TEXT").run();
      }

      // 2. Fix note_stats table for Feedback Loop
      const statsCols = db.prepare("PRAGMA table_info(note_stats)").all().map((c: any) => c.name);
      if (!statsCols.includes('draft_id')) {
          console.log('Migrating note_stats: Adding draft_id...');
          db.prepare("ALTER TABLE note_stats ADD COLUMN draft_id INTEGER").run();
      }

      // 3. Fix trending_notes table for TrendService
      const trendCols = db.prepare("PRAGMA table_info(trending_notes)").all().map((c: any) => c.name);
      if (!trendCols.includes('category')) {
          console.log('Migrating trending_notes: Adding category...');
          db.prepare("ALTER TABLE trending_notes ADD COLUMN category TEXT").run();
      }
      if (!trendCols.includes('video_url')) {
          console.log('Migrating trending_notes: Adding video_url...');
          db.prepare("ALTER TABLE trending_notes ADD COLUMN video_url TEXT").run();
      }
      if (!trendCols.includes('images')) {
          console.log('Migrating trending_notes: Adding images...');
          db.prepare("ALTER TABLE trending_notes ADD COLUMN images TEXT").run(); // JSON Array
      }
      if (!trendCols.includes('search_keyword')) {
          console.log('Migrating trending_notes: Adding search_keyword...');
          db.prepare("ALTER TABLE trending_notes ADD COLUMN search_keyword TEXT").run();
      }
      if (!trendCols.includes('topic_tags')) {
          console.log('Migrating trending_notes: Adding topic_tags...');
          db.prepare("ALTER TABLE trending_notes ADD COLUMN topic_tags TEXT").run(); // JSON Array
      }

  } catch (e) {
      console.error('Final Consistency Migration failed:', e);
  }

  // RPA Selectors Table (Dynamic CSS Selectors)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rpa_selectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT DEFAULT 'xiaohongshu',
      category TEXT NOT NULL,
      key TEXT NOT NULL,
      selector TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform, category, key)
    )
  `);

  // Seed Default Selectors (Partial Seed - Application will fallback to hardcoded if missing)
  try {
      const count = db.prepare('SELECT COUNT(*) as c FROM rpa_selectors').get() as { c: number };
      if (count.c === 0) {
          console.log('Seeding default RPA selectors...');
          const stmt = db.prepare('INSERT INTO rpa_selectors (category, key, selector) VALUES (?, ?, ?)');
          const defaults = [
              { c: 'Common.Login', k: 'Container', s: '.login-container, .login-box' },
              { c: 'Publish.Form', k: 'TitleInput', s: 'input#post-title, .title-input input, input[placeholder="输入标题"]' },
              { c: 'Publish.Form', k: 'PublishButton', s: 'button.publish-btn, button:has-text("发布")' }
          ];
          defaults.forEach(d => stmt.run(d.c, d.k, d.s));
      }
  } catch (e) { console.error('Seed selectors failed', e); }

  // Init Default Compliance Rules (Anti-Limiting)
  try {
      const count = db.prepare('SELECT COUNT(*) as c FROM compliance_rules').get() as { c: number };
      if (count.c === 0) {
          console.log('Initializing default compliance rules...');
          const stmt = db.prepare('INSERT INTO compliance_rules (category, keyword, level, suggestion) VALUES (?, ?, ?, ?)');
          const rules = [
              // Forbidden (Strict Block)
              { c: 'forbidden', k: '脚本', l: 'BLOCK', s: '自动化/黑科技' },
              { c: 'forbidden', k: '爬虫', l: 'BLOCK', s: '搜集灵感/看热点' },
              { c: 'forbidden', k: 'RPA', l: 'BLOCK', s: '小工具/小助手' },
              { c: 'forbidden', k: '外挂', l: 'BLOCK', s: '辅助工具' },
              { c: 'forbidden', k: '防封号', l: 'BLOCK', s: '安全稳定' },
              { c: 'forbidden', k: '引流', l: 'BLOCK', s: '涨粉/获客' },
              { c: 'forbidden', k: '加V', l: 'BLOCK', s: '私信' },
              // Sensitive (Warning)
              { c: 'sensitive', k: '最', l: 'WARN', s: '超/非常/绝' },
              { c: 'sensitive', k: '第一', l: 'WARN', s: '首选' },
              { c: 'sensitive', k: '绝对', l: 'WARN', s: '真的' }
          ];
          rules.forEach(r => stmt.run(r.c, r.k, r.l, r.s));
      }
  } catch (e) { console.error('Init compliance rules failed', e); }

  // --- Performance Indexes ---
  // These significantly speed up the most common queries.
  // Each CREATE INDEX is idempotent — IF NOT EXISTS is the default.
  try {
    // Tasks: status-based queries (task list, active tasks, scheduled tasks)
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, scheduled_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)');

    // Accounts: active account lookup
    db.exec('CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active)');

    // Comments: per-account queries with time ordering
    db.exec('CREATE INDEX IF NOT EXISTS idx_comments_account ON comments(account_id, create_time)');

    // Note stats: per-account analytics queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_note_stats_account ON note_stats(account_id, record_date)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_note_stats_draft ON note_stats(draft_id)');

    // Trending notes: keyword search, type filtering
    db.exec('CREATE INDEX IF NOT EXISTS idx_trending_notes_keyword ON trending_notes(search_keyword)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_trending_notes_type ON trending_notes(type)');

    // Drafts: sorting by update time
    db.exec('CREATE INDEX IF NOT EXISTS idx_drafts_updated ON drafts(updated_at)');

    // Competitors: per-competitor note queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_competitor_notes_competitor ON competitor_notes(competitor_id)');
  } catch (e) {
    console.error('Failed to create indexes:', e);
  }

  console.log('Database initialized.');
}

export default db;
