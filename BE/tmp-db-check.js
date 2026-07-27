const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', port: 3306 });
    const [dbs] = await conn.query("SHOW DATABASES LIKE 'project-managment'");
    console.log('dbs', dbs.length ? dbs.map((r) => r.Database) : []);
    if (dbs.length) {
      const [tables] = await conn.query('SHOW TABLES FROM `project-managment`');
      console.log('tables', tables);
      const [users] = await conn.query('SELECT COUNT(*) AS cnt FROM `project-managment`.users');
      console.log('users count', users[0].cnt);
    }
    await conn.end();
  } catch (err) {
    console.error('error:', err.message);
    process.exit(1);
  }
})();
