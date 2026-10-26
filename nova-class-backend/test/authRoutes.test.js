const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const pool = require("../config/db");
const originalQuery = pool.query;
const routerPath = require.resolve("../routes/victoria/auth.routes");

async function start() {
  delete require.cache[routerPath];                       // a fresh limiter (its counters start at zero)
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require(routerPath));
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  return { server, url: `http://127.0.0.1:${server.address().port}/api/auth/login` };
}
const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("login: after 10 failed sign-ins from one address the next one is a 429, with a clear message", async t => {
  pool.query = async () => [[]];                          // no such account
  const { server, url } = await start();
  t.after(() => { server.close(); pool.query = originalQuery; delete require.cache[routerPath]; });

  for (let i = 0; i < 10; i++) {
    const res = await post(url, { email: "nobody@nova.com", password: "wrong-password" });
    assert.equal(res.status, 401, `attempt ${i + 1}`);
  }
  const blocked = await post(url, { email: "nobody@nova.com", password: "wrong-password" });
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Too many sign-in attempts/);
});

test("login: successful sign-ins do not use up the allowance", async t => {
  const bcrypt = require("bcrypt");
  const hash = await bcrypt.hash("right-password", 4);
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  pool.query = async () => [[{ id: 1, name: "Vic", email: "vic@nova.com", username: "victoria6", password: hash, role: "student" }]];
  const { server, url } = await start();
  t.after(() => { server.close(); pool.query = originalQuery; delete require.cache[routerPath]; });

  for (let i = 0; i < 12; i++) {
    const res = await post(url, { email: "vic@nova.com", password: "right-password" });
    assert.equal(res.status, 200, `sign-in ${i + 1}`);
  }
});
