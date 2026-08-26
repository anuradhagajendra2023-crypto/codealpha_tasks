const Database = require("better-sqlite3");

// Create / open SQLite database
const db = new Database("socialmedia.db");

// Enable foreign keys
db.pragma("foreign_keys = ON");

// ============================
// USERS TABLE
// ============================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        bio TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// ============================
// POSTS TABLE
// ============================

db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
`);

// ============================
// COMMENTS TABLE
// ============================

db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (post_id)
        REFERENCES posts(id)
        ON DELETE CASCADE,

        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
`);

// ============================
// LIKES TABLE
// ============================

db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,

        UNIQUE(post_id, user_id),

        FOREIGN KEY (post_id)
        REFERENCES posts(id)
        ON DELETE CASCADE,

        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
`);

// ============================
// FOLLOWS TABLE
// ============================

db.exec(`
    CREATE TABLE IF NOT EXISTS follows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,

        UNIQUE(follower_id, following_id),

        FOREIGN KEY (follower_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

        FOREIGN KEY (following_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    )
`);

console.log("Social Media database initialized successfully!");

module.exports = db;