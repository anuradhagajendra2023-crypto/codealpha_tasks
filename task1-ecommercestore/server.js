const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();
const PORT = 3000;

// ============================
// Middleware
// ============================

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
    session({
        secret: "codealpha-secret",
        resave: false,
        saveUninitialized: false
    })
);

// ============================
// EJS Configuration
// ============================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ============================
// Get Products From Database
// ============================

const getProducts = () => {
    return db.prepare("SELECT * FROM products").all();
};

// ============================
// Registration
// ============================

app.get("/register", (req, res) => {
    res.render("register", {
        error: null
    });
});

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.render("register", {
            error: "All fields are required"
        });
    }

    try {
        const existingUser = db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);

        if (existingUser) {
            return res.render("register", {
                error: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.prepare(`
            INSERT INTO users (name, email, password)
            VALUES (?, ?, ?)
        `).run(name, email, hashedPassword);

        res.redirect("/login");

    } catch (error) {
        console.error(error);

        res.render("register", {
            error: "Registration failed"
        });
    }
});

// ============================
// Login
// ============================

app.get("/login", (req, res) => {
    res.render("login", {
        error: null
    });
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render("login", {
            error: "Email and password are required"
        });
    }

    try {
        const user = db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);

        if (!user) {
            return res.render("login", {
                error: "Invalid email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.render("login", {
                error: "Invalid email or password"
            });
        }

        // Save user in session
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email
        };

        res.redirect("/");

    } catch (error) {
        console.error(error);

        res.render("login", {
            error: "Login failed"
        });
    }
});

// ============================
// Logout
// ============================

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// ============================
// Home Page
// ============================

app.get("/", (req, res) => {
    const products = getProducts();

    res.render("products", {
        products,
        user: req.session.user || null
    });
});

// ============================
// Product Details
// ============================

app.get("/product/:id", (req, res) => {
    const product = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(req.params.id);

    if (!product) {
        return res.status(404).send("Product not found");
    }

    res.render("product-details", {
        product
    });
});

// ============================
// Add Product To Cart
// ============================

app.post("/cart/add/:id", (req, res) => {
    const product = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(req.params.id);

    if (!product) {
        return res.status(404).send("Product not found");
    }

    if (product.stock <= 0) {
        return res.status(400).send("Product is out of stock");
    }

    if (!req.session.cart) {
        req.session.cart = [];
    }

    const existingItem = req.session.cart.find(
        item => item.id === product.id
    );

    if (existingItem) {

        if (existingItem.quantity >= product.stock) {
            return res.status(400).send(
                "Cannot add more than available stock"
            );
        }

        existingItem.quantity += 1;

    } else {

        req.session.cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: 1
        });
    }

    res.redirect("/cart");
});

// ============================
// Cart Page
// ============================

app.get("/cart", (req, res) => {
    const cart = req.session.cart || [];

    const total = cart.reduce((sum, item) => {
        return sum + item.price * item.quantity;
    }, 0);

    res.render("cart", {
        cart,
        total
    });
});

// ============================
// Remove From Cart
// ============================

app.post("/cart/remove/:id", (req, res) => {

    if (req.session.cart) {
        req.session.cart = req.session.cart.filter(
            item => item.id !== req.params.id
        );
    }

    res.redirect("/cart");
});

// ============================
// Update Cart
// ============================

app.post("/cart/update/:id", (req, res) => {

    const cart = req.session.cart || [];

    const item = cart.find(
        item => item.id === req.params.id
    );

    if (!item) {
        return res.status(404).send(
            "Product not found in cart"
        );
    }

    const quantity = parseInt(req.body.quantity);

    if (isNaN(quantity) || quantity < 1) {
        return res.redirect("/cart");
    }

    const product = db
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(req.params.id);

    if (!product) {
        return res.status(404).send(
            "Product not found"
        );
    }

    if (quantity > product.stock) {
        return res.status(400).send(
            `Only ${product.stock} items available`
        );
    }

    item.quantity = quantity;

    res.redirect("/cart");
});

// ============================
// Checkout Page
// ============================

app.get("/checkout", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    const cart = req.session.cart || [];

    if (cart.length === 0) {
        return res.redirect("/cart");
    }

    const total = cart.reduce((sum, item) => {
        return sum + item.price * item.quantity;
    }, 0);

    res.render("checkout", {
        cart,
        total
    });
});

// ============================
// Place Order
// ============================

app.post("/checkout", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    const cart = req.session.cart || [];

    if (cart.length === 0) {
        return res.redirect("/cart");
    }

    // Check stock
    for (const item of cart) {

        const product = db
            .prepare("SELECT * FROM products WHERE id = ?")
            .get(item.id);

        if (!product) {
            return res.status(404).send(
                "Product not found"
            );
        }

        if (item.quantity > product.stock) {
            return res.status(400).send(
                `Not enough stock for ${product.name}`
            );
        }
    }

    // Calculate total
    const total = cart.reduce((sum, item) => {
        return sum + item.price * item.quantity;
    }, 0);

    // Create order
    const orderResult = db.prepare(`
        INSERT INTO orders
        (user_id, total, name, email, address)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        req.session.user.id,
        total,
        req.body.name,
        req.body.email,
        req.body.address
    );

    const orderId = orderResult.lastInsertRowid;

    // Prepare statements
    const insertOrderItem = db.prepare(`
        INSERT INTO order_items
        (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
        UPDATE products
        SET stock = stock - ?
        WHERE id = ?
    `);

    // Save order items and update stock
    for (const item of cart) {

        insertOrderItem.run(
            orderId,
            item.id,
            item.quantity,
            item.price
        );

        updateStock.run(
            item.quantity,
            item.id
        );
    }

    // Order object for confirmation page
    const order = {
        id: orderId,
        name: req.body.name,
        email: req.body.email,
        address: req.body.address,
        items: cart,
        total: total
    };

    // Clear cart
    req.session.cart = [];

    // Show confirmation
    res.render("order-confirmation", {
        order
    });
});

// ============================
// Order History
// ============================
// ============================
// Order History
// ============================

app.get("/orders", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    const orders = db.prepare(`
        SELECT *
        FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC
    `).all(req.session.user.id);

    // Add items to every order
    for (const order of orders) {

        order.items = db.prepare(`
            SELECT
                order_items.quantity,
                order_items.price,
                products.name,
                products.image
            FROM order_items
            JOIN products
            ON order_items.product_id = products.id
            WHERE order_items.order_id = ?
        `).all(order.id);
    }

    res.render("orders", {
        orders
    });
});

// ============================
// Start Server
// ============================

app.listen(PORT, () => {
    console.log(
        `Server running at http://localhost:${PORT}`
    );
});