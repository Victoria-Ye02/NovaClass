# NovaClass

**수업, 출석, 성적, AI 튜터까지 — 하나의 플랫폼에서.**

NovaClass는 선생님과 학생이 수업을 만들고 참여하고, 자료를 올리고, AI의 도움을 받아 공부까지 이어서 할 수 있도록 만든 교육 플랫폼입니다. 특히 외국인 유학생을 위한 한국어능력시험(TOPIK) AI 튜터 **K.MATE**가 대표 기능입니다.

<!-- TODO: 서비스 대표 스크린샷 또는 로고 이미지 -->

---

## 왜 만들었나요

- **교육 자동화의 필요성** — 채점, 요약, 피드백 같은 교사의 반복 업무를 AI가 덜어주면 수업의 질이 올라갑니다.
- **다국어 지원의 공백** — 외국인 유학생이 늘어나는 만큼, 모국어 기반 학습 지원이 필요합니다.
- **개인화 학습의 부재** — 기존 LMS는 학생마다 다른 수준과 속도에 맞춰주지 못합니다.

수업 자료는 이 메신저, 과제 안내는 저 게시판, 시험 준비는 또 다른 앱... 학습에 필요한 것들이 여기저기 흩어져 있으면 정작 집중해야 할 "공부"에 쓸 에너지가 줄어듭니다. NovaClass는 **수업 운영과 AI 학습 지원을 한 곳에** 모아서, 선생님은 관리에 드는 품을 줄이고 학생은 공부에만 집중할 수 있게 하는 것을 목표로 합니다.

---

## 기존 서비스와 무엇이 다른가요

|  | 구글 클래스룸 등 기존 LMS | NovaClass |
|---|---|---|
| 자료 요약 | 선생님이 직접 정리 | AI가 3단계(한 줄/단락/상세)로 자동 요약 |
| 언어 지원 | 단일 언어 UI | 영어/미얀마어/한국어/베트남어 UI + 실시간 번역 |
| 학습 지원 | 자료 배포까지만 | AI 튜터(K.MATE)가 질의응답·퀴즈까지 이어서 지원 |
| 학생 관리 | 명단 확인 정도 | 석차·출석률·위험군(at-risk) 자동 감지 + 교사 노트 전송 |

---

## 지금 되는 기능

- **회원가입 / 로그인** — 선생님(teacher) / 학생(student) 역할 구분
- **클래스 개설 및 참여** — 초대 코드로 학생이 클래스에 참여
- **수업 자료 업로드 + AI 요약** — PDF/문서를 올리면 AI가 짧은 요약 / 문단 요약 / 상세 요약 3단계로 정리, 관련 유튜브 자료 자동 추천
- **자료별 하이라이트 · 댓글** — PDF 위 형광펜 표시 저장, 공개/비공개 댓글 스레드
- **과제 (Assignment)** — 제출/채점/반려, AI가 제출 답안을 미리 점검, 댓글
- **출석 (Attendance)** — 세션별 출석 체크, 첨부파일 포함 결석계 제출 및 검토
- **성적 · 학생 관리 (Grades / People)** — 석차, 성적 추이(스파크라인), 위험군(at-risk) 자동 감지, 교사→학생 노트 전송
- **게시글 / 공지 (Posts)** — 좋아요, 상단 고정, 댓글
- **학습 자료실 (Resources)** — 링크/파일 형태의 참고 자료 모음
- **캘린더** — 클래스별 일정 등록/조회
- **알림** — 과제 등록, 채점 완료 등 실시간 알림 (Dashboard 종 아이콘)
- **클래스별 AI 튜터** — 교사가 진도/과제 컨텍스트를 지정하면 학생 질문에 맞춰 답변
- **K.MATE AI 튜터** — 한국어로 질문하면 답변, TOPIK 연습 퀴즈 생성 및 채점, 음성 답변(TTS)
- **TOPIK Hub** — 스마트 드릴(레벨·영역·문제 범위별 연습), TOPIK 부스터, 문법·의미 카드, 기출 문제
- **TOPIK QR 바로가기 (MVP)** — `/topik-qr`에서 QR 코드를 만들고, 휴대폰으로 스캔하면 스마트 드릴 연습 화면으로 바로 연결 (로그인 필요, 현재는 고정 경로만 연결)
- **멀티모달 파일 분석** — 이미지/오디오/PDF/DOCX를 올리면 AI가 내용을 읽고 질문에 답변
- **대시보드** — AI가 정리해주는 오늘 할 일, 마감 임박 배너, 출석 현황, 알림, 캘린더 한눈에 보기
- **다국어 UI + 실시간 번역** — 영어/미얀마어/한국어/베트남어 지원

---

## 개발 중인 기능

- **화상 수업 연동 (Meeting)** — 설계만 되어 있고 아직 정식 기능은 없음

---

## K.MATE — TOPIK 준비를 도와주는 AI 튜터

외국인 유학생이 가장 부담스러워하는 것 중 하나가 TOPIK(한국어능력시험) 준비입니다. K.MATE는:

- 한국어로 질문하면 즉시 답변
- TOPIK 실전 연습 퀴즈를 즉석에서 생성
- 푼 문제를 채점하고 설명까지 제공

K.MATE는 NovaClass의 대표 기능이지만, **NovaClass 자체는 K.MATE 하나만을 위한 앱이 아니라 수업 전체를 아우르는 통합 플랫폼**입니다.

---

## 기술 스택

```
React 19 + Vite                 (프론트엔드)
        │  Axios + JWT
        ▼
Node.js / Express 5  ◄──────►  MySQL (로컬 개발) / TiDB Cloud (배포, MySQL 호환)
        │
        ▼
OpenAI — 채팅·요약·퀴즈·과제 점검 등 텍스트 생성 전반
Groq Whisper — 음성 파일 텍스트 변환
Google Cloud Vision — 이미지 속 텍스트/사물 인식, PDF 스캔본 OCR
Gemini — 텍스트 레이어가 깨진 PDF 페이지 판독
ElevenLabs — K.MATE 음성 답변(TTS)
```

---

## 앞으로의 비전

지금 당장 만드는 중은 아니지만, NovaClass가 궁극적으로 지향하는 방향입니다:

- **10개 이상 언어 실시간 번역** — 더 많은 국적의 유학생 지원
- **코드 디버거** — 실시간 오류 분석 및 수정 제안
- **음성 인식(STT) 질의응답** — 말로 묻고 답을 듣는 학습 경험

---

## 팀

| 역할 | 이름 | 주요 업무 |
|---|---|---|
| 프론트엔드 | Victoria | UI 컴포넌트 개발, API 연동, 반응형 웹 구현 |
| 백엔드 | Thine Htike Aung | 데이터베이스 설계, API 엔드포인트 구현, 서버 로직 |
| Project Manager | Nant Khin Sandar Lin | 일정 관리, 팀 회의 주관, 요구사항 정의 |
| UI/UX Design | Wuttywin | 와이어프레임·프로토타입, 디자인 가이드라인 |
| PPT / Research | Roi Aung, Ja Seng Nan | 프로젝트 조사·분석, 발표 자료 제작, 문서화 |

**전주비전대학교** · 혁신지원사업 2026 — D-MIX 공모전 출품작

---

## 개발자용: 로컬 실행

```bash
# 백엔드
cd nova-class-backend
npm install
npm run dev      # 기본 포트 5001

# 프론트엔드
cd nova-class-frontend
npm install
npm run dev       # http://localhost:5173
```

`nova-class-backend/.env`에 필요한 값은 아래와 같습니다. 전체 목록은 [`nova-class-backend/.env.example`](nova-class-backend/.env.example) 참고.

- **DB 접속**: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`(기본 3306), `DB_SSL`(기본 비활성)
  - 로컬 MySQL: `DB_HOST=localhost`, 포트·SSL 값은 비워 둠
  - TiDB Cloud: `DB_PORT=4000`, `DB_SSL=true` (TLS 필수)
- **인증/AI 키**: `JWT_SECRET`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` 등

> 비밀번호와 키는 절대 커밋하지 마세요. `.env`는 `.gitignore`에 포함되어 있습니다.

### 배포 (Render)

루트의 [`render.yaml`](render.yaml)이 백엔드(Node 웹 서비스)와 프론트엔드(정적 사이트) 두 서비스를 정의합니다.

1. GitHub에 push → Render 대시보드에서 **New → Blueprint**로 저장소 연결
2. `sync: false`로 표시된 변수(DB 접속 정보, `JWT_SECRET`, API 키, `VITE_GOOGLE_CLIENT_ID`, `VITE_API_ORIGIN` 등)를 Render 대시보드에서 입력
3. `VITE_API_ORIGIN`에는 배포된 백엔드 주소를 넣고, 프론트엔드를 다시 빌드

### QR 바로가기 로컬 테스트 (휴대폰)

- 휴대폰과 개발 PC가 **같은 Wi-Fi**에 있어야 합니다.
- `vite.config.js`의 `server.host: '0.0.0.0'` 설정으로 LAN에서 접속할 수 있습니다. 테스트 후에는 필요에 따라 되돌리세요.
- QR에 들어가는 주소는 `VITE_PUBLIC_BASE`(기본값 `http://192.168.0.4:5174`)로 바꿀 수 있습니다. 배포 후에는 배포 주소를 지정하세요.

자세한 폴더 구조와 협업 규칙은 [`docs/PROJECT.md`](docs/PROJECT.md) 참고.
