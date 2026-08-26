const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const db = require("./database");

const app = express();
const PORT = 3000;

// ============================
// MIDDLEWARE
// ============================

app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.use(
    session({
        secret: "codealpha-social-secret",
        resave: false,
        saveUninitialized: false
    })
);

// ============================
// EJS
// ============================

app.set("view engine", "ejs");

app.set(
    "views",
    path.join(__dirname, "views")
);

// ============================
// LOGIN MIDDLEWARE
// ============================

function requireLogin(req, res, next) {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    next();
}

// ============================
// REGISTER PAGE
// ============================

app.get("/register", (req, res) => {

    res.render("register", {
        error: null
    });

});

// ============================
// REGISTER USER
// ============================

app.post("/register", async (req, res) => {

    const {
        name,
        username,
        email,
        password
    } = req.body;

    if (
        !name ||
        !username ||
        !email ||
        !password
    ) {

        return res.render("register", {
            error: "All fields are required."
        });

    }

    try {

        const existingUser = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
            OR username = ?
        `).get(
            email,
            username
        );

        if (existingUser) {

            return res.render("register", {
                error:
                    "Email or username already exists."
            });

        }

        const hashedPassword =
            await bcrypt.hash(password, 10);

        db.prepare(`
            INSERT INTO users
            (
                name,
                username,
                email,
                password
            )
            VALUES (?, ?, ?, ?)
        `).run(
            name,
            username,
            email,
            hashedPassword
        );

        res.redirect("/login");

    } catch (error) {

        console.error(error);

        res.render("register", {
            error: "Registration failed."
        });

    }

});

// ============================
// LOGIN PAGE
// ============================

app.get("/login", (req, res) => {

    res.render("login", {
        error: null
    });

});

// ============================
// LOGIN USER
// ============================

app.post("/login", async (req, res) => {

    const {
        email,
        password
    } = req.body;

    if (!email || !password) {

        return res.render("login", {
            error:
                "Email and password are required."
        });

    }

    try {

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {

            return res.render("login", {
                error:
                    "Invalid email or password."
            });

        }

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatch) {

            return res.render("login", {
                error:
                    "Invalid email or password."
            });

        }

        req.session.user = {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email
        };

        res.redirect("/");

    } catch (error) {

        console.error(error);

        res.render("login", {
            error: "Login failed."
        });

    }

});

// ============================
// LOGOUT
// ============================

app.get("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/login");

    });

});

// ============================
// HOME / FEED
// ============================

app.get("/", requireLogin, (req, res) => {

    const posts = db.prepare(`
        SELECT
            posts.id,
            posts.content,
            posts.created_at,

            users.id AS user_id,
            users.name,
            users.username,

            (
                SELECT COUNT(*)
                FROM likes
                WHERE likes.post_id = posts.id
            ) AS like_count,

            (
                SELECT COUNT(*)
                FROM comments
                WHERE comments.post_id = posts.id
            ) AS comment_count

        FROM posts

        JOIN users
        ON posts.user_id = users.id

        ORDER BY posts.created_at DESC
    `).all();

    // Check whether current user liked each post

    for (const post of posts) {

        const like = db.prepare(`
            SELECT id
            FROM likes
            WHERE post_id = ?
            AND user_id = ?
        `).get(
            post.id,
            req.session.user.id
        );

        post.liked = !!like;
    }

    res.render("feed", {

        posts,

        user: req.session.user

    });

});

// ============================
// CREATE POST
// ============================

app.post(
    "/posts",
    requireLogin,
    (req, res) => {

        const content = req.body.content;

        if (
            !content ||
            !content.trim()
        ) {

            return res.redirect("/");

        }

        db.prepare(`
            INSERT INTO posts
            (
                user_id,
                content
            )
            VALUES (?, ?)
        `).run(
            req.session.user.id,
            content.trim()
        );

        res.redirect("/");

    }
);

// ============================
// DELETE POST
// ============================

app.post(
    "/posts/delete/:id",
    requireLogin,
    (req, res) => {

        const post = db.prepare(`
            SELECT *
            FROM posts
            WHERE id = ?
        `).get(req.params.id);

        if (!post) {

            return res.status(404).send(
                "Post not found"
            );

        }

        if (
            post.user_id !==
            req.session.user.id
        ) {

            return res.status(403).send(
                "You can only delete your own posts."
            );

        }

        db.prepare(`
            DELETE FROM posts
            WHERE id = ?
        `).run(req.params.id);

        res.redirect("/");

    }
);

// ============================
// LIKE / UNLIKE
// ============================

app.post(
    "/posts/:id/like",
    requireLogin,
    (req, res) => {

        const post = db.prepare(`
            SELECT *
            FROM posts
            WHERE id = ?
        `).get(req.params.id);

        if (!post) {

            return res.status(404).send(
                "Post not found"
            );

        }

        const existingLike = db.prepare(`
            SELECT id
            FROM likes
            WHERE post_id = ?
            AND user_id = ?
        `).get(
            req.params.id,
            req.session.user.id
        );

        if (existingLike) {

            // Unlike

            db.prepare(`
                DELETE FROM likes
                WHERE post_id = ?
                AND user_id = ?
            `).run(
                req.params.id,
                req.session.user.id
            );

        } else {

            // Like

            db.prepare(`
                INSERT INTO likes
                (
                    post_id,
                    user_id
                )
                VALUES (?, ?)
            `).run(
                req.params.id,
                req.session.user.id
            );

        }

        res.redirect("/");

    }
);

// ============================
// ADD COMMENT
// ============================

app.post(
    "/posts/:id/comments",
    requireLogin,
    (req, res) => {

        const content = req.body.content;

        if (
            !content ||
            !content.trim()
        ) {

            return res.redirect("/");

        }

        const post = db.prepare(`
            SELECT *
            FROM posts
            WHERE id = ?
        `).get(req.params.id);

        if (!post) {

            return res.status(404).send(
                "Post not found"
            );

        }

        db.prepare(`
            INSERT INTO comments
            (
                post_id,
                user_id,
                content
            )
            VALUES (?, ?, ?)
        `).run(
            req.params.id,
            req.session.user.id,
            content.trim()
        );

        res.redirect("/");

    }
);

// ============================
// USER PROFILE
// ============================

app.get(
    "/profile/:username",
    requireLogin,
    (req, res) => {

        const profileUser = db.prepare(`
            SELECT
                id,
                name,
                username,
                email,
                bio,
                created_at
            FROM users
            WHERE username = ?
        `).get(req.params.username);

        if (!profileUser) {

            return res.status(404).send(
                "User not found"
            );

        }

        const posts = db.prepare(`
            SELECT
                id,
                content,
                created_at,

                (
                    SELECT COUNT(*)
                    FROM likes
                    WHERE likes.post_id = posts.id
                ) AS like_count,

                (
                    SELECT COUNT(*)
                    FROM comments
                    WHERE comments.post_id = posts.id
                ) AS comment_count

            FROM posts

            WHERE user_id = ?

            ORDER BY created_at DESC
        `).all(profileUser.id);

        const followers = db.prepare(`
            SELECT COUNT(*) AS count
            FROM follows
            WHERE following_id = ?
        `).get(profileUser.id).count;

        const following = db.prepare(`
            SELECT COUNT(*) AS count
            FROM follows
            WHERE follower_id = ?
        `).get(profileUser.id).count;

        const isFollowing = db.prepare(`
            SELECT id
            FROM follows
            WHERE follower_id = ?
            AND following_id = ?
        `).get(
            req.session.user.id,
            profileUser.id
        );

        res.render("profile", {

            profileUser,

            posts,

            followers,

            following,

            isFollowing: !!isFollowing,

            currentUser: req.session.user

        });

    }
);

// ============================
// FOLLOW / UNFOLLOW
// ============================

app.post(
    "/profile/:id/follow",
    requireLogin,
    (req, res) => {

        const targetUser = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(req.params.id);

        if (!targetUser) {

            return res.status(404).send(
                "User not found"
            );

        }

        if (
            targetUser.id ===
            req.session.user.id
        ) {

            return res.status(400).send(
                "You cannot follow yourself."
            );

        }

        const existingFollow = db.prepare(`
            SELECT id
            FROM follows
            WHERE follower_id = ?
            AND following_id = ?
        `).get(
            req.session.user.id,
            targetUser.id
        );

        if (existingFollow) {

            // Unfollow

            db.prepare(`
                DELETE FROM follows
                WHERE follower_id = ?
                AND following_id = ?
            `).run(
                req.session.user.id,
                targetUser.id
            );

        } else {

            // Follow

            db.prepare(`
                INSERT INTO follows
                (
                    follower_id,
                    following_id
                )
                VALUES (?, ?)
            `).run(
                req.session.user.id,
                targetUser.id
            );

        }

        res.redirect(
            `/profile/${targetUser.username}`
        );

    }
);

// ============================
// START SERVER
// ============================

app.listen(PORT, () => {

    console.log(
        `Social Media Platform running at http://localhost:${PORT}`
    );

});