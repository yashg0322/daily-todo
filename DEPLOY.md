# Deploy Daily Todo for Everyone

Right now `localhost` means **only your PC** can open the app. To let other people use it, pick one of these options.

---

## Option 1 — Same Wi-Fi (fastest, free)

Good for: classmates, colleagues, family on the **same network**.

### Steps

1. Start the server:
   ```powershell
   cd C:\Users\yashgho\Projects\daily-todo
   python server/app.py
   ```

2. Note the **Wi-Fi URL** printed in the terminal, e.g.:
   ```
   http://10.79.112.213:3000
   ```

3. Share that link with others on your Wi-Fi.

4. If it doesn't work, allow port **3000** in Windows Firewall:
   ```powershell
   New-NetFirewallRule -DisplayName "Daily Todo" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```

**Limitation:** Only works on the same network, and only while your PC is running the server.

---

## Option 2 — Deploy to the internet (Render, free)

Good for: **anyone anywhere** with a public link like `https://daily-todo-xxxx.onrender.com`.

### Steps

1. **Push code to GitHub**
   ```powershell
   cd C:\Users\yashgho\Projects\daily-todo
   git add .
   git commit -m "Prepare for deployment"
   ```
   Create a repo on GitHub, then:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/daily-todo.git
   git push -u origin main
   ```

2. **Create a Render account** at [https://render.com](https://render.com)

3. **New → Web Service** → connect your GitHub repo

4. Render will detect `render.yaml` automatically. Or set manually:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn server.app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`

5. **Environment variables** (important):
   | Key | Value |
   |-----|-------|
   | `JWT_SECRET` | A long random string (e.g. 32+ characters) |

6. Click **Deploy**. In ~2–5 minutes you get a public URL.

7. Share that URL — anyone can **Create account** and use their own planner.

**Note:** On Render's free plan, the app sleeps after inactivity (first visit may take ~30s to wake up). Database resets if the service is redeployed unless you add a persistent disk.

---

## Option 3 — Quick tunnel (ngrok, for testing)

Good for: sharing with someone **immediately** without deploying.

1. Install ngrok: [https://ngrok.com/download](https://ngrok.com/download)

2. Start your app:
   ```powershell
   python server/app.py
   ```

3. In another terminal:
   ```powershell
   ngrok http 3000
   ```

4. Share the `https://xxxx.ngrok.io` link ngrok gives you.

**Limitation:** Free ngrok URLs change each time you restart it.

---

## Security checklist (before going public)

- [ ] Set a strong `JWT_SECRET` in `.env` (local) or cloud env vars
- [ ] Never commit `.env` to GitHub (already in `.gitignore`)
- [ ] Use HTTPS in production (Render/ngrok provide this automatically)

---

## Summary

| Method | Who can access | Cost | Your PC must stay on? |
|--------|----------------|------|------------------------|
| localhost | Only you | Free | Yes |
| Wi-Fi IP | Same network | Free | Yes |
| Render | Anyone on internet | Free tier | No |
| ngrok | Anyone with link | Free tier | Yes |

**Recommended:** Use **Wi-Fi** for quick local sharing, **Render** for a permanent public app.
