import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware: allow our React development server to make requests.
app.use(cors({
    origin: ["http://localhost:5173","https://checklist-client-six.vercel.app",
    ],
  })
);

// Middleware: allow Express to read JSON request bodies.
app.use(express.json());

// Our first API route.
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Checklist API is running!",
  });
});

//Test Neon Connection
app.get("/api/db", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        NOW() AS server_time
    `);

    res.status(200).json({
      status: "success",
      message: "Connected to Neon PostgreSQL!",
      database: result.rows[0].database_name,
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(500).json({
      status: "error",
      message: "Database connection failed",
    });
  }
});

//API database endpoint checks
app.get("/api/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, completed, due_date, created_at
      FROM tasks
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      status: "success",
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Failed to retrieve tasks:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to retrieve tasks",
    });
  }
});

//POST Request
app.post("/api/tasks", async (req, res) => {
  const { title } = req.body;

  // Validate the incoming data.
  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({
      status: "error",
      message: "A non-empty task title is required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks (title)
       VALUES ($1)
       RETURNING id, title, completed, due_date, created_at`,
      [title.trim()]
    );

    res.status(201).json({
      status: "success",
      message: "Task created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to create task:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to create task.",
    });
  }
});


//Patch Requests
app.patch("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body ?? {};

  const hasCompleted = Object.hasOwn(body, "completed");
  const hasDueDate = Object.hasOwn(body, "due_date");

  // Validate the task ID.
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid task ID.",
    });
  }

  // Require at least one field to update.
  if (!hasCompleted && !hasDueDate) {
    return res.status(400).json({
      status: "error",
      message: "Provide completed or due_date to update.",
    });
  }

  // Completion must be a Boolean.
  if (hasCompleted && typeof body.completed !== "boolean") {
    return res.status(400).json({
      status: "error",
      message: "completed must be true or false.",
    });
  }

  // Due date must be a valid YYYY-MM-DD date or null.
  if (hasDueDate && body.due_date !== null) {
    const date = body.due_date;

    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00.000Z`)) ||
      new Date(`${date}T00:00:00.000Z`)
        .toISOString()
        .slice(0, 10) !== date
    ) {
      return res.status(400).json({
        status: "error",
        message: "due_date must be a valid YYYY-MM-DD date or null.",
      });
    }
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET
         completed = CASE
           WHEN $1::boolean IS NULL THEN completed
           ELSE $1::boolean
         END,
         due_date = CASE
           WHEN $2::boolean THEN $3::date
           ELSE due_date
         END
       WHERE id = $4
       RETURNING id, title, completed, due_date, created_at`,
      [
        hasCompleted ? body.completed : null,
        hasDueDate,
        hasDueDate ? body.due_date : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Task not found.",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Task updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to update task:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to update task.",
    });
  }
});


//Delete Request
app.delete("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;

  // Validate the task ID.
  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid task ID.",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1
       RETURNING id, title, completed, due_date, created_at`,
      [id]
    );

    // No matching row was deleted.
    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Task not found.",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Task deleted successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to delete task:", error.message);

    res.status(500).json({
      status: "error",
      message: "Failed to delete task.",
    });
  }
});

// Start listening for HTTP requests.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});