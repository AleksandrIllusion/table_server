const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = 5000;

// Настройка пула соединений для PostgreSQL
const pool = new Pool({
  user: "postgres", // Замените на ваш логин PostgreSQL
  host: "localhost",
  database: "table", // Замените на имя вашей базы данных
  password: "qwerty12345", // Замените на ваш пароль PostgreSQL
  port: 5432,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Создание нового казино
app.post("/casinos", async (req, res) => {
  const {
    casino_name,
    casino_features,
    casino_bonus,
    casino_rate,
    country_id,
    link,
    logoimg,
  } = req.body; // Изменены имена полей
  console.log(req.body);
  try {
    const result = await pool.query(
      "INSERT INTO casino (casino_name, casino_features, casino_bonus, casino_rate, country_id,link,logoimg) VALUES ($1, $2, $3, $4, $5,$6,$7) RETURNING *",
      [
        casino_name,
        casino_features,
        casino_bonus,
        casino_rate,
        country_id,
        link,
        logoimg,
      ] // Изменены имена полей
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create casino" });
  }
});

// Получение списка казино
app.get("/casinos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM casino");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch casinos" });
  }
});

// Получение казино по ID
app.get("/casinos/:id", async (req, res) => {
  const { id } = req.params;
  console.log(id);
  try {
    const result = await pool.query("SELECT * FROM casino WHERE id = $1", [id]);
    if (result.rows.length > 0) {
      console.log(result.rows[0]);
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ error: "Casino not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch casino" });
  }
});

// Обновление казино
app.put("/casinos/:id", async (req, res) => {
  const { id } = req.params;
  const {
    casino_name,
    casino_features,
    casino_bonus,
    casino_rate,
    country_id,
    link,
    logoimg,
  } = req.body; // Изменены имена полей
  try {
    const result = await pool.query(
      "UPDATE casino SET casino_name = $1,link=$7,logoimg=$8, casino_features = $2, casino_bonus = $3, casino_rate = $4, country_id = $5 WHERE id = $6 RETURNING *",
      [
        casino_name,
        casino_features,
        casino_bonus,
        casino_rate,
        country_id,
        id,
        link,
        logoimg,
      ] // Изменены имена полей
    );
    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ error: "Casino not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update casino" });
  }
});

// Удаление казино
app.delete("/casinos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM casino WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length > 0) {
      res.status(200).json({ message: "Casino deleted" });
    } else {
      res.status(404).json({ error: "Casino not found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete casino" });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
