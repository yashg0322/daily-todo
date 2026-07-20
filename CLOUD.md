# Deploy in 5 minutes — get a link anyone can use

Your app needs to run on a **cloud server**, not your PC. Then you get a link like:

**`https://daily-todo.onrender.com`**

Anyone can open it, create an account, and use their own planner.

---

## Steps

### 1. Put code on GitHub

Open [https://github.com/new](https://github.com/new) → create a repo named `daily-todo` (empty, no README).

Then in PowerShell:

```powershell
cd C:\Users\yashgho\Projects\daily-todo
git add .
git commit -m "Daily Todo app"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/daily-todo.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your GitHub username.

---

### 2. Deploy on Render (free)

1. Go to [https://render.com](https://render.com) → Sign up (free)
2. Click **New +** → **Web Service**
3. Connect GitHub → select **daily-todo** repo
4. Render fills settings automatically from `render.yaml`
5. Click **Deploy Web Service**
6. Wait ~3 minutes

---

### 3. Copy your link

Render gives you a URL like:

```
https://daily-todo-xxxx.onrender.com
```

**Share this link** — anyone in the world can:
- Open it in a browser
- Click **Create account**
- Use their own private planner

---

## That's it

| Before | After |
|--------|-------|
| `localhost:3000` — only you | `https://....onrender.com` — everyone |

No need to keep your PC on. The cloud runs 24/7 (free tier sleeps after 15 min idle; first visit may take ~30 sec to wake).

---

## Optional: stronger security

In Render → your service → **Environment** → add:

| Key | Value |
|-----|-------|
| `JWT_SECRET` | Any long random string (32+ characters) |

Render auto-generates this if you use `render.yaml`.
