const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function setup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      username VARCHAR(50) UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('teacher','student') DEFAULT 'student',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Nullable: existing accounts (and Google sign-ins, which never collect an
  // ID) simply can't log in by username until one is set.
  // This server doesn't support `ADD COLUMN IF NOT EXISTS` (unlike the
  // `materials` patches below) — ER_DUP_FIELDNAME is caught instead.
  await conn.query(`ALTER TABLE users ADD COLUMN username VARCHAR(50) UNIQUE`).catch(err => {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      subject VARCHAR(100) DEFAULT 'General',
      code CHAR(6) NOT NULL UNIQUE,
      teacher_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS class_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL,
      user_id INT NOT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_member (class_id, user_id),
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS materials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      instructions TEXT,
      week INT DEFAULT 1,
      file_path VARCHAR(255),
      uploaded_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);
  // Add columns for existing installations
  await conn.query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS instructions TEXT`).catch(() => {});
  await conn.query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS week INT DEFAULT 1`).catch(() => {});

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_summaries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL UNIQUE,
      summary_short TEXT,
      summary_paragraph TEXT,
      summary_detailed TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_chat_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      question_hash CHAR(64) NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      lang VARCHAR(10),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_material_question (material_id, question_hash),
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  // Unlike material_chat_cache above (a shared answer cache keyed by
  // question text, no user), this is each student's own running
  // conversation with the lesson assistant — scoped per (user, material) so
  // it can be reloaded and continued next time they open the same lesson,
  // instead of resetting to the greeting every time the panel remounts.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_chat_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      user_id INT NOT NULL,
      role ENUM('user','assistant') NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_material_user (material_id, user_id, created_at)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS youtube_suggest_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      content_hash CHAR(64) NOT NULL UNIQUE,
      search_query VARCHAR(255),
      videos_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Slide-by-slide lecture narration for the PDF tutor. A script is a pure
  // function of one page's text in one language, so it is generated once and
  // reused for every student; content_hash invalidates it when the page text
  // (or the prompt version) changes.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS lecture_scripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      page_no INT NOT NULL,
      lang VARCHAR(10) NOT NULL DEFAULT 'en',
      content_hash CHAR(40) NOT NULL,
      narration TEXT NOT NULL,
      key_points JSON NULL,
      model VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_lecture_slide (material_id, page_no, lang),
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  // The whole-PDF "lesson map" (storyline + a gist per slide) that every slide
  // script is written against, so the lecture flows as one story.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS lecture_outlines (
      material_id INT PRIMARY KEY,
      content_hash CHAR(40) NOT NULL,
      payload JSON NOT NULL,
      model VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  // Pop-up quick checks, one per slide. `payload` holds the question, options
  // and the correct answer; the answer is only ever sent back by the grading
  // endpoint, never with the question.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS lecture_quizzes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      page_no INT NOT NULL,
      lang VARCHAR(10) NOT NULL DEFAULT 'en',
      content_hash CHAR(40) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_lecture_quiz (material_id, page_no, lang),
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  // AI Study Mentor (Auto-Summary / Practice Quiz / Smart Highlighting) —
  // pure functions of a material's own content, same result for every
  // student who opens it in the same language, so cache per (material,
  // action, lang) instead of every viewer separately paying for the same
  // AI call. lang is part of the key, not just a display detail — a Korean
  // student and a Myanmar student asking for the same action must never
  // share a cached response written in the other one's language.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_ai_cache (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      action VARCHAR(20) NOT NULL,
      lang VARCHAR(10) NOT NULL DEFAULT 'en',
      result_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_material_action_lang (material_id, action, lang),
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);
  // Installations from before `lang` was part of the cache key: add the
  // column and widen the unique key to include it.
  await conn.query(`ALTER TABLE material_ai_cache ADD COLUMN lang VARCHAR(10) NOT NULL DEFAULT 'en'`).catch(err => {
    if (!err.message.includes("Duplicate column")) throw err;
  });
  // The new key must exist before dropping the old one — MySQL refuses to
  // drop uniq_material_action while it's the only index covering the
  // material_id foreign key.
  await conn.query(`ALTER TABLE material_ai_cache ADD UNIQUE KEY uniq_material_action_lang (material_id, action, lang)`).catch(err => {
    if (!err.message.includes("Duplicate key name")) throw err;
  });
  await conn.query(`ALTER TABLE material_ai_cache DROP INDEX uniq_material_action`).catch(err => {
    if (!err.message.includes("check that column/key exists")) throw err;
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      author_id INT NOT NULL,
      target_student_id INT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_page_bookmarks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      material_id INT NOT NULL,
      page_number INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_material_page_bookmark (user_id, material_id, page_number),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_highlight_analyses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      material_id INT NOT NULL,
      source_fingerprint CHAR(64) NOT NULL,
      analysis_version INT UNSIGNED NOT NULL DEFAULT 1,
      status ENUM('pending','processing','ready','failed') NOT NULL DEFAULT 'pending',
      total_pages INT UNSIGNED NOT NULL,
      completed_pages INT UNSIGNED NOT NULL DEFAULT 0,
      failure_code VARCHAR(80),
      attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_material_highlight_analysis (material_id, source_fingerprint, analysis_version),
      FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_highlight_pages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      analysis_id INT NOT NULL,
      page_number INT UNSIGNED NOT NULL,
      source_type ENUM('text','ocr') NOT NULL,
      candidates_json LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_material_highlight_page (analysis_id, page_number),
      FOREIGN KEY (analysis_id) REFERENCES material_highlight_analyses(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS material_pdf_highlights (
      id INT AUTO_INCREMENT PRIMARY KEY,
      analysis_id INT NOT NULL,
      page_number INT UNSIGNED NOT NULL,
      excerpt TEXT NOT NULL,
      explanation TEXT,
      category VARCHAR(80),
      rects_json JSON NOT NULL,
      display_order INT UNSIGNED NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (analysis_id) REFERENCES material_highlight_analyses(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      link_url VARCHAR(500),
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_user (user_id, is_read, created_at)
    )
  `);

  // Moved here from a self-executing IIFE at the top of posts.controller.js —
  // running DDL as a side effect of merely `require()`-ing a controller
  // meant every import (including from test files, which mock pool.query
  // but only *inside* each test body, after the module has already loaded
  // and fired this for real) opened a genuine DB connection that never got
  // closed, leaving an idle handle that kept the process alive indefinitely.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_like (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES class_posts(id) ON DELETE CASCADE
    )
  `);
  await conn.query(`ALTER TABLE class_posts ADD COLUMN is_pinned TINYINT(1) DEFAULT 0`).catch(err => {
    if (!err.message.includes("Duplicate column")) throw err;
  });
  // getPosts (posts.controller.js) always SELECTs this column, but until now
  // it was only ever added lazily inside createPost — so any environment
  // where no one had yet created a post with an image had a class_posts
  // table missing it entirely, and every single getPosts call (i.e. every
  // page load) 500'd with "Unknown column 'p.image_path'".
  await conn.query(`ALTER TABLE class_posts ADD COLUMN image_path VARCHAR(500) NULL`).catch(err => {
    if (!err.message.includes("Duplicate column")) throw err;
  });

  // Moved here from the same self-executing-IIFE pattern in
  // attendance.controller.js, for the same reason as post_likes above.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL,
      student_id INT NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      reason_type VARCHAR(50) NOT NULL DEFAULT 'other',
      details TEXT,
      attachment_path VARCHAR(500),
      status ENUM('pending','approved','rejected') DEFAULT 'pending',
      reviewed_by INT,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `);
  await conn.query(`ALTER TABLE leave_requests ADD COLUMN attachment_path VARCHAR(500)`).catch(err => {
    if (!err.message.includes("Duplicate column")) throw err;
  });

  // Moved here from the same bare-pool.query()-at-module-load pattern in
  // classroom.controller.js, for the same reason as post_likes above.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ai_tutor_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL,
      lesson_context TEXT,
      homework_context TEXT,
      enabled TINYINT(1) DEFAULT 1,
      created_by INT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_class (class_id)
    )
  `);

  // Moved here from the same self-executing-async-function-at-module-load
  // pattern in calendar.controller.js, for the same reason as post_likes
  // above — this one hadn't caused a visible failure yet only because no
  // test file happened to import calendar.controller.js so far.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      class_id INT NOT NULL,
      teacher_id INT NOT NULL,
      date DATE NOT NULL,
      title VARCHAR(255) NOT NULL,
      color VARCHAR(7) DEFAULT '#4F46E5',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS kmate_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // K-Mate TOPIK practice quiz history and weak points (also created on first use by quizStore)
  for (const ddl of require("../services/topik/quizStore").TABLES) await conn.query(ddl);
  for (const ddl of require("../services/topik/guides").TABLES) await conn.query(ddl);   // cached strategy guides and grammar explanations

  console.log("✅ All tables created successfully");
  await conn.end();
}

setup().catch(err => { console.error("❌", err.message); process.exit(1); });
