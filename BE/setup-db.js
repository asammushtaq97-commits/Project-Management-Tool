const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env file not found in backend');
    }

    const env = fs.readFileSync(envPath, 'utf8');
    const vars = Object.fromEntries(env.split(/\r?\n/).filter(Boolean).map((line) => {
      const [key, ...rest] = line.split('=');
      return [key, rest.join('=')];
    }));

    const conn = await mysql.createConnection({
      host: vars.DB_HOST || 'localhost',
      user: vars.DB_USER || 'root',
      password: vars.DB_PASSWORD || '',
      port: vars.DB_PORT ? Number(vars.DB_PORT) : 3306,
      multipleStatements: true,
    });

    console.log('Connecting to MySQL as', vars.DB_USER);

    const dbName = vars.DB_NAME || 'project-managment';
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await conn.query(`USE \`${dbName}\`;`);

    const schema = fs.readFileSync(path.resolve(__dirname, 'sql', 'schema.sql'), 'utf8');
    await conn.query(schema);

    console.log('Database and tables are ready in', dbName);
    const [tables] = await conn.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`, [dbName]);
    console.log('Tables:', tables.map((row) => row.TABLE_NAME));
    await conn.end();
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }
})();
