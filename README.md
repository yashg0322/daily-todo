# Daily Todo — Multi-User Life Planner

A structured daily planner with **user accounts** — each person gets their own private tasks, reflections, and settings.

## Features

- **Sign up / Sign in** — separate accounts, private data
- **Dashboard sections** — Top 3, Scheduled, Quick Wins, Learning, Inbox
- **End-of-day reflection** — mood, wins, improvements, notes
- **Server storage** — SQLite database with per-user isolation
- Export / import backup, dark/light theme

## Quick start

### 1. Install Python dependencies

```powershell
cd C:\Users\yashgho\Projects\daily-todo
python -m pip install -r requirements.txt
```

### 2. Configure environment (optional)

```powershell
copy .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET` before sharing publicly.

### 3. Start the server

```powershell
python server/app.py
```

Open **http://localhost:3000**

### 4. Create an account

Click **Create account** — each user gets their own private planner.

## Share with others

Anyone with the URL can **register** and use their own account. Data never mixes between users.

**Same Wi‑Fi:** others visit `http://YOUR-PC-IP:3000` (allow port 3000 in Windows Firewall).

**Internet:** deploy to Railway, Render, PythonAnywhere, or any VPS. Set `JWT_SECRET` in environment variables.

## Alternative: Node.js server

If you have Node.js installed:

```powershell
npm install
npm start
```

Both servers use the same API and database file.

## Project structure

```
daily-todo/
├── server/
│   ├── app.py          # Python Flask API (recommended)
│   └── index.js        # Node.js alternative
├── public/             # Frontend
├── data/               # SQLite database (auto-created)
└── requirements.txt
```

## Tech stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python Flask (or Node.js Express)
- **Database:** SQLite
- **Auth:** bcrypt + JWT
