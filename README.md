# AxiomAI 🧠

AxiomAI is a powerful, AI-driven learning and research workspace. By combining advanced Retrieval-Augmented Generation (RAG) with a suite of active learning tools, AxiomAI transforms static documents and videos into interactive study experiences.

## ✨ Features

- **Personalized Notebooks**: Organize your research into distinct, isolated workspaces.
- **Multimodal Ingestion**: Upload and chat with various source types:
  - PDFs and Text Files (stored securely on **Amazon S3**)
  - Web Pages & Articles
  - YouTube Videos & Full Playlists (automatic transcript extraction)
- **Intelligent RAG Chat**: Ask questions across your sources and get accurate answers backed by precise citations pointing to the exact chunk of text or video timestamp.
- **Axiom Studio (Active Learning)**:
  - **Flashcards**: Automatically generate spaced-repetition flashcards from your material.
  - **Quizzes**: Test your knowledge with AI-generated multiple-choice quizzes.
  - **Mind Maps**: Visualize complex concepts and relationships extracted from your sources.
  - **Learning Roadmaps**: Generate step-by-step learning paths with estimated times and curated outcomes.
- **Secure Authentication**: Built-in user management and secure API endpoints powered by **Clerk**.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State & Routing**: React Hooks, Lucide Icons
- **Auth**: `@clerk/react`

### Backend
- **Server**: Node.js + Express + TypeScript
- **Database (Relational)**: Neon Serverless PostgreSQL via Prisma ORM
- **Database (Vector)**: Qdrant (for fast semantic search)
- **Queue & Workers**: BullMQ + Redis (for asynchronous document processing)
- **Blob Storage**: Amazon S3 (`@aws-sdk/client-s3`)
- **AI / LLM**: OpenAI (`openai` for LLM and Embeddings)
- **Auth**: `@clerk/express`

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Bun](https://bun.sh/) (recommended for fast package management)
- [Docker](https://www.docker.com/) (for running local Redis and Qdrant)

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/AxiomAI.git
cd AxiomAI
```

### 2. Start Infrastructure
Run the local Qdrant and Redis instances via Docker Compose:
```bash
docker-compose up -d
```

### 3. Setup Environment Variables
You will need to create two environment files.

**Backend (`backend/.env`)**:
```env
PORT=3001
NODE_ENV=development

# Databases
DATABASE_URL="postgresql://user:pass@host/db"
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY=""

# API Keys
YOUTUBE_API_KEY="your_youtube_api_key"
OPENAI_API_KEY="your_openai_api_key"

# AWS S3 Blob Storage
AWS_ACCESS_KEY_ID="your_aws_access_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET_NAME="axiom-ai"

# Clerk Authentication
CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```

**Frontend (`frontend/.env.local`)**:
```env
VITE_CLERK_PUBLISHABLE_KEY="pk_test_..."
```

### 4. Install Dependencies & Start

**Backend:**
```bash
cd backend
bun install

# Generate Prisma Client & Push Schema
bun run db:generate
bun run db:push

# Start the API server
bun run dev

# Start the background ingestion worker (in a new terminal)
bun run worker
```

**Frontend:**
```bash
cd frontend
bun install

# Start the Vite development server
bun run dev
```

Visit `http://localhost:5173` to view the application!

## 📦 Deployment

AxiomAI is designed to be easily deployed to modern cloud providers:
- **Frontend**: Best suited for Vercel.
- **Backend (API & Worker)**: Best suited for Render (Web Service + Background Worker).
- **Databases**: Neon (Serverless Postgres), Qdrant Cloud, and Upstash/Render Redis.

*(A detailed deployment guide is provided in the repository artifacts).*

## 📄 License
This project is licensed under the MIT License.
