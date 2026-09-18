# 플랜두씨 다이어리 (ALEPH 과제 6)

계획(Plan) → 실제로 한 일(Do) → 돌아보기(See)가 서버 데이터베이스로 이어지는 다이어리입니다.
로그인은 아직 없습니다. 링크를 아는 사람은 누구나 볼 수 있으니 남이 봐도 괜찮은 내용만 넣습니다.

## 스택
- Node.js + Express (서버)
- PostgreSQL (데이터베이스)
- 바닐라 HTML/CSS/JS (프론트엔드, 별도 빌드 도구 없음)
- Render.com (배포)

## 로컬에서 실행하기 (VS Code 등)

```bash
npm install
cp .env.example .env   # DATABASE_URL을 본인 로컬 postgres 정보로 수정
npm run migrate         # 테이블 생성
npm run seed             # (선택) 예시 실제 데이터(수면 습관 계획)로 채우기
npm start                # http://localhost:3000
```

## Render.com 배포하기

1. 이 저장소를 GitHub에 푸시합니다 (GitHub Desktop 사용 가능).
2. Render 대시보드 → New → Blueprint → 이 저장소 선택 → `render.yaml`을 인식하면 그대로 적용.
   - PostgreSQL 무료 DB(`plando-db`)와 웹 서비스(`plando-diary`)가 함께 생성됩니다.
   - 배포 시 `npm install` → `npm run migrate` → `npm start` 순서로 자동 실행됩니다.
3. 배포 후 주소로 접속해 새로고침해도 값이 남는지 확인합니다.
4. `server/db/seed.sql`의 내용을 Render 대시보드의 psql 콘솔(Shell)에서 실행하거나,
   화면에서 직접 계획/할 일/실행 기록을 입력해 실제 데이터를 채웁니다.

## API 요약
- `GET/POST /api/plans`, `GET/PUT/DELETE /api/plans/:id` (수정 시 이전 값은 `plan_revisions`에 보존)
- `GET/POST /api/todos`, `PUT/DELETE /api/todos/:id`, `POST /api/todos/:id/complete`, `POST /api/todos/:id/undo`
- `GET/POST /api/logs?todo_id=`
- `GET /api/review/:planId`, `GET /api/review/:planId/drilldown/:metric`, `GET/POST /api/review/:planId/notes`
- `GET /api/export` — 전체 자료 JSON 파일 내려받기

## 짧은 확인 방법
1. **어디로 가나요**: 배포된 주소를 새 시크릿 창에서 엽니다 (로그인 없음).
2. **세 단계 안에 무엇을 하나요**: ① "계획" 탭에서 계획 확인 → ② "할 일" 탭에서 할 일 완료 체크 또는 실행 기록 추가 → ③ "돌아보기" 탭에서 집계 숫자 클릭.
3. **무엇이 보이면 통과인가요**: 계획·할 일·실행 기록이 실제 값으로 채워져 있고, 돌아보기 집계가 0이 아니며, 숫자를 누르면 근거 기록 목록이 뜬다.
4. **안 될 때는 무엇이 보이나요**: 서버 오류 시 상단에 alert 메시지, 데이터가 없을 때는 "해당하는 기록이 없습니다" 문구.

## AI와 내 판단
- **AI에게 맡긴 일**: DB 스키마 설계, Express API 구현, 프론트엔드 구현, Render 배포 설정 파일 작성.
- **내가 직접 판단한 일**: 실제 계획 주제(수면 습관 개선)와 배포 스택(Node.js + PostgreSQL + Render) 선택.
- **AI 제안을 따르지 않은 일**: (진행하며 채우기)
