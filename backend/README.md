# ChatPDF + Personal Chat History Backend

Simple beginner-friendly backend using Node.js, Express, MongoDB, LanceDB, JWT auth, PDF upload, and Gemini API.

## Features

- User signup
- User login
- JWT protected routes
- Upload PDF with tags
- Extract PDF text
- Split PDF text into 800 character chunks
- Create embeddings with Gemini
- Store PDF chunks in LanceDB
- Store user, document, and chat history in MongoDB
- Ask questions from uploaded PDFs
- Include last 20 chats as memory
- Run C/C++ code on the server (compile + execute)
- LLM-based code analysis (time/space complexity + suggestions + rewritten code)

## Install

```bash
npm install
```

## Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Update `.env`:

```env
PORT=5000
HOST=0.0.0.0
MONGO_URI=mongodb://127.0.0.1:27017/chatpdf_history
JWT_SECRET=change_this_secret
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
# Optional: cache Gemini calls to avoid repeat LLM hits
LANGCACHE_ENABLED=true
LANGCACHE_DIR=./.cache
# LANGCACHE_TTL_SECONDS=0  # 0 = never expire
# LANGCACHE_LOGS=true      # red=LLM call, blue=cache hit
# Optional: semantic cache (reuse answer for similar questions)
# SEMANTIC_CACHE_MAX_DISTANCE=0.12
LANCEDB_PATH=./lancedb_data
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# Easier on a server:
FIREBASE_SERVICE_ACCOUNT_PATH=/home/ubuntu/geofence/firebase-service-account.json

# Optional: server-side code runner limits
# CODE_RUN_TIMEOUT_MS=4000
# CODE_RUN_COMPILE_TIMEOUT_MS=12000
# CODE_RUN_MAX_CODE_CHARS=80000
# CODE_RUN_MAX_INPUT_CHARS=40000
# CODE_RUN_MAX_OUTPUT_CHARS=120000
# Optional: override compilers
# CC=gcc
# CXX=g++

### Reset / Flush everything

Dry run (shows what will be deleted):

```bash
npm run flush:all
```

Real flush (deletes: `.cache`, `uploads`, Postgres `pdf_chunks` + `semantic_answer_cache`, Mongo `Chat` + `Document` + `LocationLog`):

```bash
CONFIRM=YES DRY_RUN=false npm run flush:all
```

Also delete all users (optional):

```bash
CONFIRM=YES DRY_RUN=false FLUSH_USERS=true npm run flush:all
```
```

Make sure MongoDB is running locally or replace `MONGO_URI` with your MongoDB Atlas URL.

## Run Server

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Server URL:

```txt
http://localhost:5000
```

## Code Runner API (C/C++)

Compile + run:

- `POST /run` (alias) or `POST /api/code/run`
- Body: `{ "language": "cpp" | "c", "code": "...", "inputs": "1 2\\n" }` (inputs can also be an array of lines)

Analyze + rewrite with Gemini:

- `POST /api/code/analyze`
- Body: `{ "language": "cpp" | "c", "code": "...", "prompt": "optional extra request" }`

## Run On A Cloud Server Without Domain

You can run the backend directly on a VPS public IP using HTTP for POC testing.

### 1. Copy backend to server

Upload this folder to your server:

```txt
RAG/backend
```

### 2. Install and configure

```bash
cd backend
npm install
```

Create `.env`:

```env
PORT=5000
HOST=0.0.0.0
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=change_this_to_a_long_random_secret
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
GEMINI_EMBEDDING_DIMENSIONS=3072
LANCEDB_PATH=./lancedb_data
LANCEDB_TABLE=pdf_chunks_3072
```

### 3. Open inbound firewall

Allow TCP port `5000` in your cloud firewall/security group.

If the server uses UFW:

```bash
sudo ufw allow 5000/tcp
```

### 4. Start backend

For quick testing:

```bash
npm start
```

For keeping it alive:

```bash
npm install -g pm2
pm2 start src/server.js --name geofence-api
pm2 save
```

### 5. Test from your browser

Open:

```txt
http://YOUR_PUBLIC_IP:5000/
```

You should see the API running JSON response.

### 6. Point Android app to server

In the React Native app, edit:

```txt
mobile/src/config.ts
```

Set:

```ts
export const API_URL = 'http://YOUR_PUBLIC_IP:5000';
```

The Android manifest already allows HTTP cleartext traffic for this POC.

## Run React Frontend

Open a second terminal and install frontend dependencies:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
cp .env.example .env
```

Default frontend `.env`:

```env
VITE_API_URL=http://localhost:5000
```

Run the React app:

```bash
npm run dev
```

Frontend URL:

```txt
http://localhost:5173
```

You can also start it from the project root:

```bash
npm run client
```

## API Requests

### 1. Signup

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nisha",
    "email": "nisha@example.com",
    "password": "123456"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nisha@example.com",
    "password": "123456"
  }'
```

Copy the `token` from the response.

### 3. Upload PDF With Tags

Tags should be comma-separated.

```bash
curl -X POST http://localhost:5000/api/pdf/upload \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@/path/to/dbms.pdf" \
  -F "tags=dbms,database,sql"
```

Flow:

- Upload PDF
- Extract text
- Split text into 800 character chunks
- Generate Gemini embeddings
- Save chunks in LanceDB
- Save document metadata in MongoDB

### 4. Ask Question

```bash
curl -X POST http://localhost:5000/api/chat/ask \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is DBMS?"
  }'
```

The backend will:

- Find a matching tag from the question
- If tag is found, search PDF chunks using that tag
- If no tag is found, search all uploaded PDFs for the user
- Fetch last 20 chats of the logged-in user
- Send question, PDF context, and previous chats to Gemini
- Save the question and answer in chat history

Response:

```json
{
  "success": true,
  "answer": "DBMS stands for Database Management System..."
}
```

## Geofence POC API

Parents signup normally, then share their `inviteCode` with the child.

### Parent signup

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Parent",
    "email": "parent@example.com",
    "password": "123456",
    "role": "parent"
  }'
```

### Child signup

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Child",
    "email": "child@example.com",
    "password": "123456",
    "role": "child",
    "parentInviteCode": "PARENT_CODE"
  }'
```

### Save parent FCM token

```bash
curl -X POST http://localhost:5000/api/geofence/fcm-token \
  -H "Authorization: Bearer PARENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"FCM_DEVICE_TOKEN","platform":"android"}'
```

### Parent sets child geofence

```bash
curl -X PATCH http://localhost:5000/api/geofence/parent/children/CHILD_ID/geofence \
  -H "Authorization: Bearer PARENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "centerLat": 28.545855,
    "centerLon": 77.299128,
    "radiusMeters": 500
  }'
```

### Child location polling request

Call this every 5 seconds from the Android app.

```bash
curl -X POST http://localhost:5000/api/geofence/child/location \
  -H "Authorization: Bearer CHILD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 28.541611,
    "lon": 77.301153,
    "accuracy": 12
  }'
```

The server calculates Haversine distance, stores every location log, and sends an FCM alert to the parent on every outside-geofence poll. If Firebase credentials are missing, the log is still saved and FCM is skipped.

## FCM Setup For Parent Alerts

The log `FCM skipped: Firebase credentials or parent tokens are missing` means one or both of these are missing:

- Backend has no Firebase service account credentials.
- Parent app has not saved its FCM token to `/api/geofence/fcm-token`.

### 1. Firebase project

Create a Firebase project and add an Android app with this package name:

```txt
com.geofencemobile
```

Download:

- `google-services.json` for the Android app.
- Service account JSON for the backend from Firebase project settings.

### 2. Mobile app file

Place `google-services.json` here before building the APK:

```txt
mobile/android/app/google-services.json
```

Then rebuild and install the Android app once.

### 3. Backend server file

Upload the service account JSON to your cloud server, for example:

```txt
/home/ubuntu/geofence/firebase-service-account.json
```

Set this in backend `.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/home/ubuntu/geofence/firebase-service-account.json
```

Restart PM2:

```bash
pm2 restart rag-backend --update-env
```

### 4. Save parent token

Open the app on the parent phone and login as the parent. The app will request notification permission, fetch the FCM token, and send it to the backend.

After that, when the child sends an outside-geofence location, the server can send a push notification to the parent phone.

### 5. Get Chat History

```bash
curl -X GET http://localhost:5000/api/chat/history \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response:

```json
{
  "success": true,
  "chats": []
}
```

## Folder Structure

```txt
src/
  server.js
  app.js

  config/
    db.js
    gemini.js
    lancedb.js

  routes/
    auth.routes.js
    pdf.routes.js
    chat.routes.js

  controllers/
    auth.controller.js
    pdf.controller.js
    chat.controller.js

  models/
    User.js
    Chat.js
    Document.js

  middleware/
    auth.js

  services/
    pdfExtract.js
    chunkText.js

uploads/
.env.example
package.json
README.md
```
# RAG
