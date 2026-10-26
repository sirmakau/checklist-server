import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:5173",
  "https://checklist-client-six.vercel.app",
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "20kb" }));

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Checklist API is running!",
  });
});

app.get("/api/db", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT current_database() AS database_name, NOW() AS server_time
    `);

    res.status(200).json({
      status: "success",
      message: "Connected to Neon PostgreSQL!",
      database: result.rows[0].database_name,
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(500).json({ status: "error", message: "Database connection failed" });
  }
});

// READ: retrieve all tasks.
app.get("/api/tasks", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, completed, due_date, created_at
      FROM tasks
      ORDER BY created_at DESC, id DESC
    `);

    res.status(200).json({
      status: "success",
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Failed to retrieve tasks:", error.message);
    res.status(500).json({ status: "error", message: "Failed to retrieve tasks" });
  }
});

// CREATE: insert a task, optionally with a due date.
app.post("/api/tasks", async (req, res) => {
  const body = req.body ?? {};
  const { title } = body;
  const dueDate = body.due_date ?? null;

  if (typeof title !== "string" || title.trim() === "" || title.trim().length > 200) {
    return res.status(400).json({
      status: "error",
      message: "A task title between 1 and 200 characters is required.",
    });
  }

  if (dueDate !== null && !isValidDateOnly(dueDate)) {
    return res.status(400).json({
      status: "error",
      message: "due_date must be a valid YYYY-MM-DD date or null.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks (title, due_date)
       VALUES ($1, $2::date)
       RETURNING id, title, completed, due_date, created_at`,
      [title.trim(), dueDate]
    );

    res.status(201).json({
      status: "success",
      message: "Task created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to create task:", error.message);
    res.status(500).json({ status: "error", message: "Failed to create task." });
  }
});

// UPDATE: patch any supported fields without changing omitted fields.
app.patch("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body ?? {};

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({ status: "error", message: "Invalid task ID." });
  }

  const hasTitle = Object.hasOwn(body, "title");
  const hasCompleted = Object.hasOwn(body, "completed");
  const hasDueDate = Object.hasOwn(body, "due_date");

  if (!hasTitle && !hasCompleted && !hasDueDate) {
    return res.status(400).json({
      status: "error",
      message: "Provide title, completed, or due_date to update.",
    });
  }

  if (hasTitle && (typeof body.title !== "string" || body.title.trim() === "" || body.title.trim().length > 200)) {
    return res.status(400).json({
      status: "error",
      message: "title must contain between 1 and 200 characters.",
    });
  }

  if (hasCompleted && typeof body.completed !== "boolean") {
    return res.status(400).json({ status: "error", message: "completed must be true or false." });
  }

  if (hasDueDate && body.due_date !== null && !isValidDateOnly(body.due_date)) {
    return res.status(400).json({
      status: "error",
      message: "due_date must be a valid YYYY-MM-DD date or null.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title = CASE WHEN $1::boolean THEN $2::text ELSE title END,
           completed = CASE WHEN $3::boolean THEN $4::boolean ELSE completed END,
           due_date = CASE WHEN $5::boolean THEN $6::date ELSE due_date END
       WHERE id = $7
       RETURNING id, title, completed, due_date, created_at`,
      [
        hasTitle,
        hasTitle ? body.title.trim() : null,
        hasCompleted,
        hasCompleted ? body.completed : null,
        hasDueDate,
        hasDueDate ? body.due_date : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Task not found." });
    }

    res.status(200).json({
      status: "success",
      message: "Task updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to update task:", error.message);
    res.status(500).json({ status: "error", message: "Failed to update task." });
  }
});

// DELETE: permanently remove one task.
app.delete("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({ status: "error", message: "Invalid task ID." });
  }

  try {
    const result = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1
       RETURNING id, title, completed, due_date, created_at`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Task not found." });
    }

    res.status(200).json({
      status: "success",
      message: "Task deleted successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to delete task:", error.message);
    res.status(500).json({ status: "error", message: "Failed to delete task." });
  }
});

app.use((req, res) => {
  res.status(404).json({ status: "error", message: "API endpoint not found." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
