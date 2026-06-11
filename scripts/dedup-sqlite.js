import sqlite3 from 'sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = path.join(__dirname, '..', 'server', 'data', 'database.sqlite')
const db = new sqlite3.Database(dbPath)

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
  })
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err)
      resolve(this.changes || 0)
    })
  })
}

async function dedup(table) {
  const dups = await all(`SELECT email, COUNT(*) as cnt FROM ${table} WHERE email IS NOT NULL AND email <> '' GROUP BY email HAVING cnt > 1`)
  let removed = 0
  for (const { email } of dups) {
    const rows = await all(`SELECT id, ts FROM ${table} WHERE email = ? ORDER BY ts DESC`, [email])
    const toDelete = rows.slice(1).map(r => r.id)
    for (const id of toDelete) {
      removed += await run(`DELETE FROM ${table} WHERE id = ?`, [id])
    }
  }
  return removed
}

(async () => {
  try {
    const removedPlayers = await dedup('players')
    const removedCoaches = await dedup('coaches')
    console.log(JSON.stringify({ removedPlayers, removedCoaches }, null, 2))
  } catch (e) {
    console.error('ERR', e.message)
    process.exit(1)
  } finally {
    db.close()
  }
})()
