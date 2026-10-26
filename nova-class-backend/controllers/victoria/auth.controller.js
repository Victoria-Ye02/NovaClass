const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../../config/db");

// No client ID at construction time: the audience is passed per-call in
// googleLogin instead, so whether GOOGLE_CLIENT_ID is configured can be
// checked live on every request rather than baked in at module load.
const googleClient = new OAuth2Client();

// The email column collates utf8mb4_0900_ai_ci: case-insensitive, but NO PAD.
// A stray space from autofill or a mobile keyboard therefore misses the row and
// surfaces as "User not found". Normalize on the way in so lookups and inserts agree.
const normalizeEmail = email => String(email ?? "").trim().toLowerCase();

const GENERIC_ERROR = "Something went wrong. Please try again.";
const BAD_LOGIN = "Invalid ID or password";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A hash to compare against when no account matches, so a wrong ID and a wrong password take about the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);
const isDuplicate = err => err?.code === "ER_DUP_ENTRY" || err?.errno === 1062;

exports.register = async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    const password = req.body.password;
    const email = normalizeEmail(req.body.email);
    // The ID doubles as a login credential alongside email, so it's
    // normalized the same way (trim + lowercase) for case-insensitive lookup.
    const username = normalizeEmail(req.body.username);
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!EMAIL_SHAPE.test(email)) return res.status(400).json({ error: "Please enter a valid email address" });
    if (username.length < 6) {
      return res.status(400).json({ error: "ID must be at least 6 characters" });
    }
    // An ID never contains "@", and an email always does, so an ID can never be someone else's email
    // (login treats a value with "@" as an email and anything else as an ID).
    if (username.includes("@")) return res.status(400).json({ error: "ID cannot contain @" });
    if (typeof password !== "string" || !password) return res.status(400).json({ error: "Password is required" });
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, username, password, role) VALUES (?, ?, ?, ?, ?)",
      [name, email, username, hashed, "student"],
    );
    res.status(201).json({ id: result.insertId, name, email, username });
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ error: "This email or ID is already registered" });
    console.error("[Auth] register failed:", err.message);
    res.status(500).json({ error: GENERIC_ERROR });
  }
};

exports.me = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const password = req.body.password;
    // The login field accepts either the account's email or its ID (username), stored trim+lowercased.
    // A value with "@" is looked up as an email and nothing else; a value without it as an ID and nothing else,
    // so the two never get mixed up.
    const identifier = normalizeEmail(req.body.email);
    if (!identifier || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Please enter your ID and password" });
    }
    const column = identifier.includes("@") ? "email" : "username";
    const [rows] = await pool.query(`SELECT * FROM users WHERE ${column} = ? LIMIT 1`, [identifier]);

    const user = rows[0];
    // Same answer, status and about the same time whether the account does not exist or the password is wrong.
    const match = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !match) return res.status(401).json({ error: BAD_LOGIN });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    // Same shape as the Google sign-in answer: the real email, so the app never has to guess it from what was typed (an ID).
    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
    });
  } catch (err) {
    console.error("[Auth] login failed:", err.message);
    res.status(500).json({ error: GENERIC_ERROR });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Name cannot be empty" });

    await pool.query("UPDATE users SET name = ? WHERE id = ?", [name, req.user.id]);
    const [rows] = await pool.query(
      "SELECT id, name, email, username, role FROM users WHERE id = ?",
      [req.user.id],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMe = async (req, res) => {
  try {
    const userId = req.user.id;

    // Classes and materials aren't cascade-deleted: silently wiping a
    // teacher's account would orphan every enrolled student's classroom.
    // Block instead, so ownership must be transferred or removed first.
    const [classRows] = await pool.query("SELECT COUNT(*) AS count FROM classes WHERE teacher_id = ?", [userId]);
    const [materialRows] = await pool.query("SELECT COUNT(*) AS count FROM materials WHERE uploaded_by = ?", [userId]);
    if (classRows[0].count > 0 || materialRows[0].count > 0) {
      return res.status(409).json({
        error: "Cannot delete an account that owns classes or uploaded materials. Please delete or transfer them first.",
      });
    }

    // A student's own class enrollments have no cascade rule either;
    // material_page_bookmarks does (ON DELETE CASCADE) and needs no manual cleanup.
    await pool.query("DELETE FROM class_members WHERE user_id = ?", [userId]);
    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "User not found" });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.googleLogin = async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: "Google sign-in is not configured on this server" });
  }

  const { credential, intent } = req.body;
  if (!credential) return res.status(400).json({ error: "Missing Google credential" });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Invalid Google credential" });
  }

  if (!payload?.email) return res.status(401).json({ error: "Google account has no email" });
  if (payload.email_verified === false) {
    return res.status(401).json({ error: "Google email is not verified" });
  }

  try {
    const email = normalizeEmail(payload.email);
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

    let user;
    if (rows.length > 0) {
      user = rows[0];
    } else if (intent !== "register") {
      // Signing in (not signing up) must not silently create an account —
      // otherwise anyone with a Google account could bypass registration entirely.
      return res.status(404).json({ error: "No account found for this Google email. Please sign up first." });
    } else {
      // Google-authenticated accounts never use the password form, but the
      // column is NOT NULL — store a random, unusable hash instead of a
      // sentinel value so it behaves like any other bcrypt hash if ever compared.
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashed = await bcrypt.hash(randomPassword, 10);
      const name = payload.name || email.split("@")[0];
      // The ID column is a login credential for password accounts. A Google account gets a default one (letters and
      // digits of the email name + a random tail, 6+ characters, never "@") so it is never left empty; retry if it is taken.
      const base = (email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20)) || "user";
      let result, username;
      for (let attempt = 0; attempt < 5; attempt++) {
        username = `${base}_${crypto.randomBytes(3).toString("hex")}`;
        try {
          [result] = await pool.query(
            "INSERT INTO users (name, email, username, password, role) VALUES (?, ?, ?, ?, ?)",
            [name, email, username, hashed, "student"],
          );
          break;
        } catch (err) {
          if (!isDuplicate(err) || attempt === 4) throw err;
        }
      }
      user = { id: result.insertId, name, email, role: "student" };
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
