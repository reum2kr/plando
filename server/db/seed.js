// 실제 데이터(수면 습관 개선 계획)를 채우는 시드 스크립트.
// "npm run seed"로 실행. 이미 같은 id로 들어간 데이터가 있으면 에러가 나므로 1회만 실행합니다.
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  await pool.query(sql);
  console.log('seed applied');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
