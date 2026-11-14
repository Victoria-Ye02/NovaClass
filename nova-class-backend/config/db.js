const mysql = require("mysql2/promise");
require("dotenv").config();

// Without this, NOW()/CURRENT_TIMESTAMP run in the DB server's SYSTEM
// timezone (KST here) while `timezone: "Z"` tells the driver to read/write
// values as UTC with no offset conversion — the two must agree, or every
// stored timestamp silently drifts by the server's UTC offset. Forcing the
// session itself to UTC on every connection is what makes them agree: the
// app always stores and returns real UTC, and each viewer's browser
// converts it to their own local time for display (the standard approach).
// DB_PORT defaults to 3306 (local MySQL). Hosted TiDB Cloud uses 4000 and requires TLS,
// so set DB_PORT=4000 and DB_SSL=true in .env for it. Leaving both unset keeps local MySQL behaviour.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ...(process.env.DB_SSL === "true" ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  timezone: "Z",
});

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

module.exports = pool;
