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
MONGO_URI=mongodb://127.0.0.1:27017/chatpdf_history
JWT_SECRET=change_this_secret
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
LANCEDB_PATH=./lancedb_data
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
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
