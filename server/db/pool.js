const { Pool, types } = require('pg');
require('dotenv').config();
 
// DATE 컬럼(1082)을 JS Date 객체가 아니라 "YYYY-MM-DD" 문자열 그대로 반환하게 한다.
// (JS Date로 바꾸면 타임존 변환 과정에서 화면에 시각까지 붙어 나오고, 날짜가 하루 밀릴 수도 있음)
types.setTypeParser(1082, (val) => val);
 
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});
 
module.exports = pool;
