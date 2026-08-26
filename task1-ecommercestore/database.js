const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const db = new Database("ecommerce.db");

db.pragma("foreign_keys = ON");

// Users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Products table
db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        category TEXT,
        stock INTEGER DEFAULT 0,
        image TEXT
    )
`);

// Orders table
db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL,
        name TEXT,
        email TEXT,
        address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

// Order items table
db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
`);

// Import products from products.json
const productsFile = path.join(
    __dirname,
    "data",
    "products.json"
);

if (fs.existsSync(productsFile)) {
    const products = JSON.parse(
        fs.readFileSync(productsFile, "utf8")
    );

    const count = db
        .prepare("SELECT COUNT(*) AS count FROM products")
        .get();

    if (count.count === 0) {
        const insert = db.prepare(`
            INSERT INTO products
            (name, description, price, category, stock, image)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const insertMany = db.transaction((products) => {
            for (const product of products) {
                insert.run(
                    product.name,
                    product.description || "",
                    product.price,
                    product.category || "",
                    product.stock || 0,
                    product.image || ""
                );
            }
        });

        insertMany(products);

        console.log("Products imported into database!");
    }
}

console.log("Database initialized successfully!");

module.exports = db;