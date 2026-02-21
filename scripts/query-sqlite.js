const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'server', 'data', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

(async () => {
  const email = process.argv[2] || '';
  try {
    const coaches = await query('SELECT * FROM coaches WHERE email = ?', [email]);
    const players = await query('SELECT * FROM players');
    console.log(JSON.stringify({ coaches, playersCount: players.length }, null, 2));
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();