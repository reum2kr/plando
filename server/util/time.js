// Asia/Seoul 기준 "오늘" 날짜 문자열(YYYY-MM-DD)을 반환한다.
// 지연(overdue) 판정 등 날짜 비교는 항상 이 값을 기준으로 한다.
function todayKstDateString() {
  const now = new Date();
  // Intl로 KST 날짜 부분만 뽑아낸다 (서버 로컬 타임존과 무관하게 안전).
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA locale gives YYYY-MM-DD
}

module.exports = { todayKstDateString };
