const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");

const db = require("./database");

const app = express();
const PORT = 3000;

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.use(
    session({
        secret: "codealpha-project-secret",
        resave: false,
        saveUninitialized: false
    })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===============================
// AUTH MIDDLEWARE
// ===============================

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    next();
}

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    res.redirect("/dashboard");
});

// ===============================
// REGISTER PAGE
// ===============================

app.get("/register", (req, res) => {
    res.render("register", {
        error: null
    });
});

// ===============================
// REGISTER
// ===============================

app.post("/register", async (req, res) => {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
        return res.render("register", {
            error: "All fields are required."
        });
    }

    try {
        const existingUser = db
            .prepare(
                "SELECT * FROM users WHERE email = ? OR username = ?"
            )
            .get(email, username);

        if (existingUser) {
            return res.render("register", {
                error: "Email or username already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.prepare(`
            INSERT INTO users
            (name, username, email, password)
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

// ===============================
// LOGIN PAGE
// ===============================

app.get("/login", (req, res) => {
    res.render("login", {
        error: null
    });
});

// ===============================
// LOGIN
// ===============================

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(email);

    if (!user) {
        return res.render("login", {
            error: "Invalid email or password."
        });
    }

    const passwordMatch = await bcrypt.compare(
        password,
        user.password
    );

    if (!passwordMatch) {
        return res.render("login", {
            error: "Invalid email or password."
        });
    }

    req.session.user = {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email
    };

    res.redirect("/dashboard");
});

// ===============================
// LOGOUT
// ===============================

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// ===============================
// DASHBOARD
// ===============================

app.get("/dashboard", requireLogin, (req, res) => {

    const projects = db.prepare(`
        SELECT
            projects.*,
            users.name AS owner_name
        FROM projects
        JOIN users
        ON projects.owner_id = users.id
        WHERE projects.owner_id = ?

        OR projects.id IN (
            SELECT project_id
            FROM project_members
            WHERE user_id = ?
        )

        ORDER BY projects.created_at DESC
    `).all(
        req.session.user.id,
        req.session.user.id
    );

    res.render("dashboard", {
        user: req.session.user,
        projects
    });
});

// ===============================
// CREATE PROJECT PAGE
// ===============================

app.get("/projects/create", requireLogin, (req, res) => {
    res.render("create-project", {
        user: req.session.user,
        error: null
    });
});

// ===============================
// CREATE PROJECT
// ===============================

app.post("/projects/create", requireLogin, (req, res) => {

    const { name, description } = req.body;

    if (!name) {
        return res.render("create-project", {
            user: req.session.user,
            error: "Project name is required."
        });
    }

    const result = db.prepare(`
        INSERT INTO projects
        (name, description, owner_id)
        VALUES (?, ?, ?)
    `).run(
        name,
        description || "",
        req.session.user.id
    );

    // Add owner as project member
    db.prepare(`
        INSERT OR IGNORE INTO project_members
        (project_id, user_id)
        VALUES (?, ?)
    `).run(
        result.lastInsertRowid,
        req.session.user.id
    );

    res.redirect("/dashboard");
});

// ===============================
// PROJECT PAGE
// ===============================

app.get("/projects/:id", requireLogin, (req, res) => {

    const projectId = req.params.id;

    const project = db.prepare(`
        SELECT
            projects.*,
            users.name AS owner_name
        FROM projects
        JOIN users
        ON projects.owner_id = users.id
        WHERE projects.id = ?
    `).get(projectId);

    if (!project) {
        return res.status(404).send("Project not found.");
    }

    // Check membership
    const member = db.prepare(`
        SELECT *
        FROM project_members
        WHERE project_id = ?
        AND user_id = ?
    `).get(
        projectId,
        req.session.user.id
    );

    if (!member) {
        return res.status(403).send("You are not a member of this project.");
    }

    const tasks = db.prepare(`
        SELECT
            tasks.*,
            users.name AS assigned_name
        FROM tasks
        LEFT JOIN users
        ON tasks.assigned_to = users.id
        WHERE tasks.project_id = ?
        ORDER BY tasks.created_at DESC
    `).all(projectId);

    const members = db.prepare(`
        SELECT
            users.id,
            users.name,
            users.username,
            users.email
        FROM users
        JOIN project_members
        ON users.id = project_members.user_id
        WHERE project_members.project_id = ?
    `).all(projectId);

    res.render("project", {
        user: req.session.user,
        project,
        tasks,
        members
    });
});

// ===============================
// ADD MEMBER
// ===============================

app.post(
    "/projects/:id/members",
    requireLogin,
    (req, res) => {

        const projectId = req.params.id;
        const { email } = req.body;

        const project = db.prepare(`
            SELECT *
            FROM projects
            WHERE id = ?
            AND owner_id = ?
        `).get(
            projectId,
            req.session.user.id
        );

        if (!project) {
            return res.status(403).send(
                "Only the project owner can add members."
            );
        }

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {
            return res.status(404).send(
                "User not found."
            );
        }

        db.prepare(`
            INSERT OR IGNORE INTO project_members
            (project_id, user_id)
            VALUES (?, ?)
        `).run(
            projectId,
            user.id
        );

        res.redirect(`/projects/${projectId}`);
    }
);

// ===============================
// CREATE TASK
// ===============================

app.post(
    "/projects/:id/tasks",
    requireLogin,
    (req, res) => {

        const projectId = req.params.id;

        const {
            title,
            description,
            assigned_to
        } = req.body;

        const member = db.prepare(`
            SELECT *
            FROM project_members
            WHERE project_id = ?
            AND user_id = ?
        `).get(
            projectId,
            req.session.user.id
        );

        if (!member) {
            return res.status(403).send(
                "You are not a project member."
            );
        }

        if (!title) {
            return res.redirect(
                `/projects/${projectId}`
            );
        }

        db.prepare(`
            INSERT INTO tasks
            (project_id, title, description, assigned_to)
            VALUES (?, ?, ?, ?)
        `).run(
            projectId,
            title,
            description || "",
            assigned_to || null
        );

        res.redirect(`/projects/${projectId}`);
    }
);

// ===============================
// UPDATE TASK STATUS
// ===============================

app.post(
    "/tasks/:id/status",
    requireLogin,
    (req, res) => {

        const taskId = req.params.id;
        const { status } = req.body;

        const task = db.prepare(`
            SELECT *
            FROM tasks
            WHERE id = ?
        `).get(taskId);

        if (!task) {
            return res.status(404).send(
                "Task not found."
            );
        }

        const member = db.prepare(`
            SELECT *
            FROM project_members
            WHERE project_id = ?
            AND user_id = ?
        `).get(
            task.project_id,
            req.session.user.id
        );

        if (!member) {
            return res.status(403).send(
                "Access denied."
            );
        }

        db.prepare(`
            UPDATE tasks
            SET status = ?
            WHERE id = ?
        `).run(
            status,
            taskId
        );

        res.redirect(
            `/projects/${task.project_id}`
        );
    }
);

// ===============================
// DELETE TASK
// ===============================

app.post(
    "/tasks/:id/delete",
    requireLogin,
    (req, res) => {

        const taskId = req.params.id;

        const task = db.prepare(`
            SELECT *
            FROM tasks
            WHERE id = ?
        `).get(taskId);

        if (!task) {
            return res.status(404).send(
                "Task not found."
            );
        }

        const project = db.prepare(`
            SELECT *
            FROM projects
            WHERE id = ?
            AND owner_id = ?
        `).get(
            task.project_id,
            req.session.user.id
        );

        if (!project) {
            return res.status(403).send(
                "Only the project owner can delete tasks."
            );
        }

        db.prepare(`
            DELETE FROM tasks
            WHERE id = ?
        `).run(taskId);

        res.redirect(
            `/projects/${task.project_id}`
        );
    }
);

// ===============================
// TASK DETAILS
// ===============================

app.get(
    "/tasks/:id",
    requireLogin,
    (req, res) => {

        const taskId = req.params.id;

        const task = db.prepare(`
            SELECT
                tasks.*,
                users.name AS assigned_name
            FROM tasks
            LEFT JOIN users
            ON tasks.assigned_to = users.id
            WHERE tasks.id = ?
        `).get(taskId);

        if (!task) {
            return res.status(404).send(
                "Task not found."
            );
        }

        const member = db.prepare(`
            SELECT *
            FROM project_members
            WHERE project_id = ?
            AND user_id = ?
        `).get(
            task.project_id,
            req.session.user.id
        );

        if (!member) {
            return res.status(403).send(
                "Access denied."
            );
        }

        const comments = db.prepare(`
            SELECT
                task_comments.*,
                users.name,
                users.username
            FROM task_comments
            JOIN users
            ON task_comments.user_id = users.id
            WHERE task_comments.task_id = ?
            ORDER BY task_comments.created_at ASC
        `).all(taskId);

        const project = db.prepare(`
            SELECT *
            FROM projects
            WHERE id = ?
        `).get(task.project_id);

        res.render("task", {
            user: req.session.user,
            task,
            comments,
            project
        });
    }
);

// ===============================
// ADD TASK COMMENT
// ===============================

app.post(
    "/tasks/:id/comments",
    requireLogin,
    (req, res) => {

        const taskId = req.params.id;
        const { comment } = req.body;

        const task = db.prepare(`
            SELECT *
            FROM tasks
            WHERE id = ?
        `).get(taskId);

        if (!task) {
            return res.status(404).send(
                "Task not found."
            );
        }

        const member = db.prepare(`
            SELECT *
            FROM project_members
            WHERE project_id = ?
            AND user_id = ?
        `).get(
            task.project_id,
            req.session.user.id
        );

        if (!member) {
            return res.status(403).send(
                "Access denied."
            );
        }

        if (!comment || !comment.trim()) {
            return res.redirect(
                `/tasks/${taskId}`
            );
        }

        db.prepare(`
            INSERT INTO task_comments
            (task_id, user_id, comment)
            VALUES (?, ?, ?)
        `).run(
            taskId,
            req.session.user.id,
            comment.trim()
        );

        res.redirect(`/tasks/${taskId}`);
    }
);

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
    console.log(
        `Project Management app running at http://localhost:${PORT}`
    );
});