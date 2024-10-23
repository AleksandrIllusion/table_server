const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
require("dotenv").config();
const app = express();
const port = 5000;

const pool = new Pool({
  max: 20, // maximum number of connections
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000,
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
// Секретный ключ для JWT
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

// Passport JWT Strategy
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_SECRET,
    },
    async (jwtPayload, done) => {
      try {
        // Поиск пользователя по id из JWT payload
        const user = await pool.query(
          "SELECT id, username, email, role FROM users WHERE id = $1",
          [jwtPayload.id]
        );

        if (user.rows.length > 0) {
          return done(null, user.rows[0]);
        } else {
          return done(null, false);
        }
      } catch (err) {
        return done(err, false);
      }
    }
  )
);
// Регистрация пользователя

app.post("/register", async (req, res) => {
  const { username, password, email, role } = req.body;

  try {
    // Проверяем, существует ли пользователь с таким email
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Вставляем нового пользователя в базу данных
    const newUser = await pool.query(
      "INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING *",
      [username, hashedPassword, email, role || false]
    );

    // Генерация JWT токена для нового пользователя
    const token = jwt.sign(
      {
        id: newUser.rows[0].id,
        username: newUser.rows[0].username,
        role: newUser.rows[0].role,
      },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // Устанавливаем токен в HttpOnly куки
    res.cookie("token", token, {
      httpOnly: true, // Не доступен через JavaScript
      secure: process.env.NODE_ENV === "production", // Только по HTTPS, если продакшн
      maxAge: 3600000, // Время жизни куки (1 час)
    });

    res.status(201).json({ token: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Логин пользователя
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Проверяем, существует ли пользователь с таким email
    console.log(email);
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length === 0) {
      // Возвращаем 200 и сообщение о неверных данных
      return res.status(200).json({
        message: "User with such email does not exist in the system",
      });
    }

    // Сравниваем пароль
    const validPassword = await bcrypt.compare(password, user.rows[0].password);

    if (!validPassword) {
      // Возвращаем 200 и сообщение о неверных данных
      return res.status(200).json({
        message: "User password is incorrect, please check and try again",
      });
    }

    // Генерация JWT токена
    const token = jwt.sign(
      {
        id: user.rows[0].id,
        username: user.rows[0].username,
        role: user.rows[0].role,
      },
      JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // Устанавливаем токен в HttpOnly куки
    res.cookie("token", token, {
      httpOnly: true, // Не доступен через JavaScript
      secure: process.env.NODE_ENV === "production", // Только по HTTPS в продакшн среде
      maxAge: 3600000, // Время жизни куки (1 час)
    });

    res.status(200).json({ token: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Middleware для защищенных маршрутов с использованием Passport
const authenticateJWT = passport.authenticate("jwt", { session: false });

// Пример защищенного маршрута
app.get("/profile", authenticateJWT, async (req, res) => {
  try {
    res.status(200).json(req.user); // req.user уже содержит данные пользователя после прохождения аутентификации
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/casinos/country/:country_id", async (req, res) => {
  const { country_id } = req.params; // Извлекаем country_id из параметров
  const { limit = 10, page = 1, sort = "desc" } = req.query; // Параметры пагинации и сортировки
  const limitValue = parseInt(limit); // Количество записей на странице
  const offset = (parseInt(page) - 1) * limitValue; // Смещение для страницы
  const orderDirection = sort.toLowerCase() === "asc" ? "ASC" : "DESC"; // Направление сортировки

  try {
    // Выполняем запрос для получения казино с указанным country_id, с пагинацией и сортировкой
    const result = await pool.query(
      `SELECT * FROM casino WHERE country_id = $1 ORDER BY casino_rate ${orderDirection} LIMIT $2 OFFSET $3`,
      [country_id, limitValue, offset]
    );

    // Запрос для подсчета общего количества казино в выбранной стране
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM casino WHERE country_id = $1",
      [country_id]
    );
    const totalCount = parseInt(countResult.rows[0].count);

    if (result.rows.length > 0) {
      res.status(200).json({
        data: result.rows, // Возвращаем найденные казино
        total: totalCount, // Общее количество казино для данного country_id
        currentPage: parseInt(page), // Текущая страница
        totalPages: Math.ceil(totalCount / limitValue), // Общее количество страниц
      });
      console.log(result.rows);
    } else {
      res
        .status(404)
        .json({ message: "No casinos found for the specified country_id" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch casinos" });
  }
});
app.get("/payments", async (req, res) => {
  const { limit = 10, page = 1, sort = "desc" } = req.query; // Параметры пагинации и сортировки
  const limitValue = parseInt(limit); // Количество записей на странице
  const offset = (parseInt(page) - 1) * limitValue; // Смещение для страницы
  const orderDirection = sort.toLowerCase() === "asc" ? "ASC" : "DESC"; // Направление сортировки

  try {
    // Выполняем запрос для получения списка платежей с пагинацией и сортировкой
    const result = await pool.query(
      `SELECT id, paymenturl,payment_title FROM payment ORDER BY id ${orderDirection} LIMIT $1 OFFSET $2`,
      [limitValue, offset]
    );

    // Запрос для подсчета общего количества записей в таблице payment
    const countResult = await pool.query("SELECT COUNT(*) FROM payment");
    const totalCount = parseInt(countResult.rows[0].count);

    if (result.rows.length > 0) {
      res.status(200).json({
        data: result.rows, // Возвращаем найденные платежи
        total: totalCount, // Общее количество записей
        currentPage: parseInt(page), // Текущая страница
        totalPages: Math.ceil(totalCount / limitValue), // Общее количество страниц
      });
    } else {
      res.status(404).json({ message: "No payments found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Изменение рейтинга казино с соседним казино с таким же country_id
app.put("/casinos/:id/swap", async (req, res) => {
  const { id } = req.params;
  const { increase } = req.body; // Boolean значение (true - повышаем, false - понижаем)

  try {
    // Получаем текущее казино по ID
    const casinoResult = await pool.query(
      "SELECT * FROM casino WHERE id = $1",
      [id]
    );
    if (casinoResult.rows.length === 0) {
      return res.status(404).json({ error: "Casino not found" });
    }

    const currentCasino = casinoResult.rows[0];
    const currentRate = currentCasino.casino_rate;
    const countryId = currentCasino.country_id;

    let neighborCasino;

    if (increase) {
      // Ищем казино с таким же country_id и ближайшим большим или равным рейтингом
      neighborCasino = await pool.query(
        `SELECT * FROM casino 
         WHERE casino_rate >= $1 AND country_id = $2 AND id != $3 
         ORDER BY casino_rate ASC LIMIT 1`,
        [currentRate, countryId, id]
      );
    } else {
      // Ищем казино с таким же country_id и ближайшим меньшим или равным рейтингом
      neighborCasino = await pool.query(
        `SELECT * FROM casino 
         WHERE casino_rate <= $1 AND country_id = $2 AND id != $3 
         ORDER BY casino_rate DESC LIMIT 1`,
        [currentRate, countryId, id]
      );
    }

    // Если нет соседнего казино, просто возвращаем сообщение
    if (neighborCasino.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "No neighboring casino to swap rates with" });
    }

    const targetCasino = neighborCasino.rows[0];

    // Обновляем рейтинг текущего казино на рейтинг соседнего
    await pool.query("UPDATE casino SET casino_rate = $1 WHERE id = $2", [
      targetCasino.casino_rate,
      id,
    ]);

    // Обновляем рейтинг соседнего казино на рейтинг текущего
    await pool.query("UPDATE casino SET casino_rate = $1 WHERE id = $2", [
      currentRate,
      targetCasino.id,
    ]);

    res.status(200).json({ message: "Casino rates swapped successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to swap casino rates" });
  }
});

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
    payment_id,
  } = req.body;

  try {
    // Check if the casino with the same name already exists
    const existingCasino = await pool.query(
      "SELECT * FROM casino WHERE casino_name = $1",
      [casino_name]
    );

    if (existingCasino.rows.length > 0) {
      // Если казино с таким именем существует, возвращаем его имя
      return res.status(200).json({
        message: "Casino already exists",
        casino_name: existingCasino.rows[0].casino_name,
      });
    }

    // If not, proceed to insert the new casino
    const result = await pool.query(
      "INSERT INTO casino (casino_name, casino_features, casino_bonus, casino_rate, country_id, link, logoimg, payment_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [
        casino_name,
        casino_features,
        casino_bonus,
        casino_rate,
        country_id,
        link,
        logoimg,
        payment_id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create casino" });
  }
});

// Получение списка казино
app.get("/casinos", async (req, res) => {
  const { limit = 10, page = 1, sort = "desc" } = req.query; // Новый параметр сортировки с дефолтным значением 'desc'
  const limitValue = parseInt(limit);
  const offset = (parseInt(page) - 1) * limitValue;
  const orderDirection = sort.toLowerCase() === "asc" ? "ASC" : "DESC"; // Определяем направление сортировки

  try {
    // Запрос для получения данных с пагинацией и сортировкой по casino_rate
    const result = await pool.query(
      `SELECT * FROM casino ORDER BY casino_rate ${orderDirection} LIMIT $1 OFFSET $2`,
      [limitValue, offset]
    );

    // Запрос для подсчета общего количества записей
    const countResult = await pool.query("SELECT COUNT(*) FROM casino");
    const totalCount = parseInt(countResult.rows[0].count);

    res.status(200).json({
      data: result.rows,
      total: totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limitValue),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch casinos" });
  }
});

// Получение казино по ID
app.get("/casinos/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM casino WHERE id = $1", [id]);

    if (result.rows.length > 0) {
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
    payment_id,
  } = req.body; // Изменены имена полей
  try {
    const result = await pool.query(
      "UPDATE casino SET casino_name = $1,link=$7,logoimg=$8,payment_id=$9, casino_features = $2, casino_bonus = $3, casino_rate = $4, country_id = $5 WHERE id = $6 RETURNING *",
      [
        casino_name,
        casino_features,
        casino_bonus,
        casino_rate,
        country_id,
        id,
        link,
        logoimg,
        payment_id,
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
// Получение всех стран
app.get("/countries", async (req, res) => {
  try {
    // Выполняем запрос для получения всех стран из таблицы country
    const result = await pool.query(
      "SELECT * FROM country ORDER BY country_name ASC"
    );

    if (result.rows.length > 0) {
      res.status(200).json(result.rows); // Возвращаем список стран
    } else {
      res.status(404).json({ message: "No countries found" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch countries" });
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
/*  */
