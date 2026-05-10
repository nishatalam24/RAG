# Major Project Report (Template Filled) — Smart Attendance + RAG Library

**Project Title:** WiFi Aware (NAN) Based Smart Attendance System with RAG-enabled Classroom Library  
**Student:** Nishat Alam Ansari  
**Program / Department:** (Edit)  
**Institute:** (Edit)  
**Academic Year:** 2025–2026 (Edit)  
**Supervisor:** (Edit)  

---

## I. Declaration
I, **Nishat Alam Ansari**, declare that this project report titled **“WiFi Aware (NAN) Based Smart Attendance System with RAG-enabled Classroom Library”** is my original work, completed as part of my academic requirements. This work has not been submitted elsewhere for any degree or diploma.

**Signature:** ____________  
**Date:** ____________  
**Place:** ____________  

---

## II. Acknowledgement
I express my sincere gratitude to my supervisor **(Edit name)** for guidance and encouragement throughout this project. I also thank my department faculty and peers for their support during development, testing, and documentation.

---

## III. Abstract
This project presents a **smart attendance system** using **WiFi Aware / Neighbor Awareness Networking (NAN)** for proximity-based discovery between teacher and student devices, combined with a **web-based RAG (Retrieval-Augmented Generation) classroom library** where teachers upload PDFs by subject and class date and students can view summaries and chat for revision.

Unlike QR/RFID/BLE/GPS attendance systems, WiFi Aware enables **peer-to-peer discovery without an access point** and works effectively indoors within a **~30–40 meter range**. Student devices publish an **enrolment ID**, teacher devices subscribe, and attendance is stored in **MongoDB** via a **Node.js/Express API** hosted on an **Oracle Cloud (OCI) Ubuntu VM** and exposed as a microservice.

On the learning side, the web application allows teachers to upload PDFs and generates structured study access for students: subject → date → summary + chat. PDFs are chunked, embedded using **Gemini embeddings**, and stored in **PostgreSQL + pgvector** for similarity search. The system supports **LLM caching** (exact cache + semantic cache) to reduce repeated API calls, and includes a **Quiz mode** that generates a class-wise quiz and stores results in chat history for revision tracking.

---

## IV. Introduction
Attendance is a critical administrative task in educational institutions. Manual processes are time-consuming and prone to errors and proxy attendance. Many digital alternatives exist (QR scanning, RFID, BLE beacons, GPS), but they have practical limitations: scanning delays, hardware overhead, indoor inaccuracy, or range constraints.

In parallel, students often struggle to revise effectively from long PDF notes. A structured archive with summaries and Q&A support can improve learning outcomes by making content discoverable and interactive.

This project combines:
- **IoT-style proximity detection** using WiFi Aware (NAN) for fast attendance marking.
- **A classroom document archive** with PDF uploads, class-date organization, and RAG-style chat for revision.

---

## V. Problem Statement
1. Existing attendance methods are slow, allow proxy marking, or require manual interaction (QR scanning).
2. GPS/BLE methods can be unreliable indoors and can be spoofed.
3. Students lack a centralized, date-wise class archive and spend time searching in PDFs.

---

## VI. Objectives
- Implement **automated proximity-based attendance** without additional hardware.
- Support **two roles**: Teacher and Student.
- Persist **student enrolment number** and attendance records securely in the backend.
- Provide a web portal where:
  - Teachers upload class PDFs (subject + class date).
  - Students browse subject shelves and date-wise uploads.
  - Students can **view the PDF** for a specific class date.
  - Students can chat for revision using the stored class content/summary.
- Deploy services in a way suitable for production (microservice base URL + environment configuration).

---

## VII. Project Scope
### 1) Users
- **Students:** authenticate, store enrolment ID, broadcast enrolment ID (mobile), view attendance, and use library for revision.
- **Teachers:** authenticate, scan nearby students (mobile), mark attendance, upload class PDFs and manage archive.

### 2) Platforms
- **Mobile:** React Native app (WiFi Aware integration using a native bridge module on Android).
- **Web:** React (Vite) frontend for library + role-based dashboards.
- **Backend:** Node.js/Express services with MongoDB for persistence.

---

## VIII. System Tools / Tech Stack
### A) Mobile (IoT / Proximity)
- React Native
- Android WiFi Aware (NAN) APIs via native bridge module

### B) Web Frontend
- React + Vite
- Fetch-based API integration
- Role-based routes for Student and Teacher dashboards
- Chat-style UI (ChatGPT/WhatsApp-like) for Q&A and quizzes

### C) Backend / Cloud
- Node.js + Express
- MongoDB
- JWT authentication for protected routes
- Multer (PDF upload to server storage)
- PostgreSQL + **pgvector** for classroom RAG vector search
- Gemini API for embeddings + answer generation
- Caching layer to avoid repeated LLM calls (disk cache + semantic cache)
- Oracle Cloud Infrastructure (OCI) Ubuntu VM (22.04) hosting microservice(s)
- Docker (for containerized deployment on OCI)

### D) Microservice Integration
- Attendance service base URL (example production): `http://158.180.17.208:3000`
- Web app uses environment variables:
  - `VITE_API_URL` (main backend)
  - `VITE_ATTENDANCE_API_URL` (attendance microservice)

---

## IX. System Architecture
### 1) High-level Architecture (Text)
**Student Device (Android)**
- Publishes `{ enrolmentId }` using WiFi Aware (NAN)

**Teacher Device (Android)**
- Subscribes to nearby publishers
- Selects detected students
- Calls API to mark attendance

**Attendance Microservice (OCI)**
- Node.js/Express REST API
- MongoDB for students + attendance

**RAG Library Web App**
- Teacher uploads PDF (subject + date) → server stores file + extracts metadata/summary
- Students browse subject shelf and class dates
- Students view PDF and chat for revision (RAG-style assistance)

### 2) Suggested Diagrams (Insert in final PDF)
- Figure 1: Overall Architecture Diagram
- Figure 2: Sequence Diagram (Student publish → Teacher subscribe → API mark → MongoDB)
- Figure 3: DFD Level 0 (Authentication + Library + Attendance)
- Figure 4: ER Diagram (Users, Documents, Attendance)

### Figure 1 (Placeholder): Overall Architecture
```text
┌──────────────────────┐         WiFi Aware (NAN)        ┌──────────────────────┐
│ Student Android App   │  publish enrolmentNumber JSON  │ Teacher Android App   │
│ (React Native + NAN)  │ ─────────────────────────────▶ │ (React Native + NAN)  │
└──────────────────────┘                                 └─────────┬────────────┘
                                                                    │ HTTPS (REST)
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │ Attendance API        │
                                                         │ Node.js + Express     │
                                                         │ OCI VM + Docker       │
                                                         └─────────┬────────────┘
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │ MongoDB              │
                                                         │ Students, Attendance │
                                                         └──────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Web RAG Library (React + Vite)                                               │
│ - Teacher uploads PDFs (subject + class date)                                │
│ - Student browses shelf → date → views PDF + summary + chat history          │
│ - Student can generate quiz and submit for score                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Figure 2 (Placeholder): Attendance Sequence
```text
Student App        Teacher App                 Attendance API                MongoDB
   | publish ID        |                             |                        |
   |------------------>| subscribe & discover         |                        |
   |                   | mark present (API call)      |                        |
   |                   |----------------------------->| insert attendance      |
   |                   |                              |----------------------->|
   |                   |                              | 200 OK                 |
   |                   |<-----------------------------|                        |
```

### Figure 3 (Placeholder): DFD Level 0
```text
            ┌───────────────┐
            │   Teacher     │
            └──────┬────────┘
                   │ upload PDF / view docs
                   ▼
        ┌─────────────────────────┐
        │  Library Backend (API)  │
        └──────────┬──────────────┘
                   │ stores files + metadata
                   ▼
            ┌───────────────┐
            │ Documents DB  │
            └───────────────┘

            ┌───────────────┐
            │   Student     │
            └──────┬────────┘
                   │ browse subjects/dates, view PDF, chat
                   ▼
        ┌─────────────────────────┐
        │  Web Frontend (React)   │
        └──────────┬──────────────┘
                   │ fetch attendance
                   ▼
        ┌─────────────────────────┐
        │ Attendance Microservice │
        └──────────┬──────────────┘
                   ▼
            ┌───────────────┐
            │ Attendance DB │
            └───────────────┘
```

### Figure 4 (Placeholder): ER Diagram (Text)
```text
User (teacher/student)
  - _id
  - name
  - email
  - role
  - enrolmentNumber (student)
  - primarySubject (teacher)

Document
  - _id
  - teacherId -> User._id
  - subject, subjectKey
  - classDate
  - originalFileName, storedFilePath
  - summary, totalChunks

Chat (MongoDB)
  - _id
  - userId -> User._id
  - subject, subjectKey
  - classDate
  - question
  - answer
  - timestamps

Quiz (MongoDB)
  - _id
  - userId -> User._id
  - subject, subjectKey
  - classDate
  - title, difficulty
  - questions[] (MCQ A-D, correct answer, explanation)

pgvector tables (PostgreSQL)
  - pdf_chunks (chunk text + embedding + lookup keys)
  - semantic_answer_cache (answer reuse by vector similarity + intent)

Attendance (Attendance microservice DB)
  - _id
  - studentId -> Student/_User._id (depending on service design)
  - date
  - status/present
```

---

## X. Functional Requirements (SRS)
### A) Authentication & Roles
- Signup as Teacher or Student
- Login using email + password
- JWT-based protected API endpoints

### B) Student Functions
- Provide and store enrolment number at signup
- Fetch attendance by enrolment number
- Browse subjects, select class dates, view summary and PDF
- Ask questions related to a class date (chat)

### C) Teacher Functions
- Upload PDF with subject + class date
- List uploaded documents
- Open uploaded PDFs
- (Mobile) Discover students via WiFi Aware and mark attendance

---

## XI. Non-Functional Requirements
- **Security:** JWT auth for protected resources; hashed passwords; input validation.
- **Performance:** WiFi Aware discovery within ~0.5–1.2 seconds (observed); API latency target < 200 ms (typical).
- **Reliability:** Microservice health endpoint and restart policy (PM2/Docker).
- **Scalability:** Separate attendance microservice; can scale independently of web backend.
- **Usability:** Simple student UX: enrolment saved once, attendance fetch uses saved enrolment automatically.

---

## XII. Database Design (ER Summary)
### A) Collections (Conceptual)
- `users` (role-based):
  - name, email, passwordHash, role, enrolmentNumber (student), primarySubject (teacher)
- `students` (attendance microservice, if separate):
  - enrolmentNumber, name, course, etc.
- `attendance`:
  - studentId, date, status/present
- `documents`:
  - teacherId, subject, subjectKey, classDate, originalFileName, storedFilePath, totalChunks, summary
- `chat_history`:
  - userId, subject, classDate, question, answer, timestamps
- `quizzes`:
  - userId, subject, classDate, title, difficulty, questions[], timestamps

### B) Vector Store (PostgreSQL + pgvector)
- `pdf_chunks`:
  - chunk metadata (teacher_id, document_id, subject_key, class_date, chunk_index)
  - content (text) + `embedding vector(N)`
  - similarity search using `<=>` distance operator
- `semantic_answer_cache`:
  - subject_key + class_date + model + intent_key
  - question embedding + cached answer
  - used to reuse answers for *similar-intent* questions

---

## XIII. API Design (Summary)
### A) Attendance Microservice (example)
- `GET /api/attendance/student/:enrolmentNumber` → fetch attendance history
- `POST /api/attendance/mark` → teacher marks attendance (mobile workflow)

### B) Library Backend (example)
- `POST /api/auth/signup`, `POST /api/auth/login`
- `POST /api/pdf/upload` (auth) → upload PDF
- `GET /api/pdf/documents` (auth) → list teacher documents
- `GET /api/pdf/documents/:id/file` (auth) → download/view PDF
- `GET /api/learning/subjects` (auth) → list subjects
- `GET /api/learning/subjects/:subject/dates` (auth) → list class dates
- `POST /api/chat/ask` (auth) → ask question for subject + date
- `GET /api/chat/history` (auth) → view previous Q&A
- `POST /api/chat/quiz` (auth) → generate quiz for selected class (stored in quiz collection + chat history)
- `POST /api/chat/quiz/submit` (auth) → submit answers and return score + breakdown (also stored in chat history)

---

## XIV. Implementation Highlights
### A) WiFi Aware Publish/Subscribe
- Student app publishes enrolment ID continuously using WiFi Aware.
- Teacher app subscribes and discovers nearby students without a WiFi router.

### B) Cloud Deployment (OCI)
- Ubuntu VM (22.04)
- Dockerized Node.js service(s)
- Open inbound ports for required APIs (e.g., 3000/5000) and SSH (22)

### C) Web PDF Rendering (Auth-protected file)
PDF files are served from an authenticated endpoint. The web UI fetches the PDF using the JWT header, converts it to a Blob URL, and renders it in an iframe for the selected class date.

### D) RAG Pipeline (pgvector + Gemini)
- PDFs are chunked and embedded using Gemini embedding models.
- Embeddings are stored in PostgreSQL using the `vector(N)` type (pgvector).
- Query flow:
  1) Embed the user question
  2) Retrieve top-k chunks using vector similarity
  3) Build a prompt with summary + chunks + prior chat
  4) Generate the final answer using Gemini chat model

### E) Caching & Cost Optimization
To avoid hitting the LLM repeatedly and reduce latency:
- **Disk cache** for embeddings and final answers (keyed by model + text/prompt).
- **Semantic answer cache** (pgvector) for similar questions with the same intent (e.g., “what is …” vs “define …”).
- Colored logs in backend:
  - Red = real Gemini API call
  - Blue = cache hit

**Key environment toggles (example):**
- `LANGCACHE_ENABLED=true|false`
- `LANGCACHE_DIR=./.cache`
- `LANGCACHE_TTL_SECONDS=0` (0 = never expire)
- `LANGCACHE_LOGS=true|false`
- `SEMANTIC_CACHE_MAX_DISTANCE=0.12` (lower = stricter matching)

### F) Timezone Safety Fix (Class Date)
The system uses a local date key (`YYYY-MM-DD` in server timezone) rather than `toISOString().slice(0,10)` to prevent off-by-one-day errors in non‑UTC timezones.

### G) Quiz System
- Students can click **Quiz** for a selected class to generate an MCQ quiz from class notes.
- Quiz is stored and rendered in chat as an interactive card with options A–D.
- On submission, the backend grades answers, returns score + explanation, and stores the score entry in chat history.

---

## XV. Results and Discussion
### A) Attendance Module (Observed / Target)
- Discovery time: ~0.5–1.2 seconds
- Indoor effective range: ~30–40 meters
- API marking latency: typically < 200 ms

### B) Library Module
- Teachers can upload PDFs by class date.
- Students can browse and open the correct PDF for a date.
- Students can chat for revision with stored summaries/history.
- Quiz generation and scoring provides structured practice per class.
- Caching reduces repeated LLM calls for repeated/similar questions, improving perceived speed.

---

## XVI. Limitations
- WiFi Aware is Android-focused and not available on iOS.
- Some Android OEMs impose background restrictions that may reduce continuous publish behavior.
- PDF rendering depends on browser PDF support; large PDFs may require streaming optimizations.

---

## XVII. Future Scope
- BLE fallback for older Android devices without WiFi Aware.
- Face recognition / liveness check for stronger anti-proxy protection.
- Geofencing for hybrid mode (WiFi Aware + GPS boundary).
- Analytics dashboard: attendance trends, subject-wise engagement, and per-class insights.
- Better RAG pipeline: embeddings + semantic search over all uploaded PDFs.
- Streaming answers (token-by-token) for a more ChatGPT-like experience.
- Improved semantic cache: stronger intent detection, better thresholds, and optional re-ranking.
- Quiz analytics: topic-wise performance, weak-area suggestions, and spaced repetition.

---

## XVIII. Bibliography (Starter)
- Android Developers — WiFi Aware / NAN documentation
- React Native documentation
- Node.js and Express documentation
- MongoDB documentation
- Oracle Cloud Infrastructure documentation

---

## Appendix A — Screenshots / UI Pages (Insert)
- Student login, dashboard, broadcast status
- Teacher scanning (radar), mark present popup, attendance table
- Web: teacher upload page, student subject shelf, class-date view with PDF iframe
