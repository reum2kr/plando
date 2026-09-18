// 배포 환경에서 "npm run migrate"로 스키마를 적용하기 위한 스크립트.
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('migration applied');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
