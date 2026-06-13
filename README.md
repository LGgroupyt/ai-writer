# AI Writer — Tamil & English
### Secure Netlify Functions build

---

## Project structure

```
ai-writer/
├── public/
│   └── index.html          ← Your frontend (no API key here)
├── netlify/
│   └── functions/
│       └── generate.js     ← Secure Claude API proxy
├── netlify.toml            ← Netlify config
└── README.md
```

---

## Deploy in 5 steps

### 1. Install Netlify CLI (once)
```bash
npm install -g netlify-cli
```

### 2. Push to GitHub
Create a new repo on github.com and push this folder:
```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/YOUR_USERNAME/ai-writer.git
git push -u origin main
```

### 3. Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **Add new site → Import an existing project**
3. Connect your GitHub repo
4. Build settings are auto-detected from `netlify.toml`
5. Click **Deploy**

### 4. Add your API key (critical — do this before sharing the URL)
In Netlify dashboard:
- Go to **Site configuration → Environment variables**
- Click **Add a variable**
- Key: `ANTHROPIC_API_KEY`
- Value: your Claude API key from console.anthropic.com
- Click **Save**, then **Trigger deploy**

### 5. Connect Razorpay
In `public/index.html`, find `handlePayment()` and replace the `alert()` with:
```js
window.open('YOUR_RAZORPAY_PAYMENT_LINK', '_blank');
```

---

## What's secured

| Old version | This version |
|-------------|-------------|
| API key in browser JS | API key only on server |
| Rate limit in localStorage (bypassable) | Rate limit server-side by IP |
| Anyone could extract key from DevTools | Key never reaches the client |
| No input validation | Topic sanitized, length capped |

---

## Upgrading rate limit storage (optional)

The current rate limiter uses in-memory storage, which resets on each Netlify function cold start. For production with many users, replace the `rateLimitStore` Map in `generate.js` with [Netlify Blobs](https://docs.netlify.com/blobs/overview/) or [Upstash Redis](https://upstash.com) (free tier available).

---

## Local development

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Create .env file
echo "ANTHROPIC_API_KEY=your_key_here" > .env

# Run locally
netlify dev
# → Opens at http://localhost:8888
```

---

## Razorpay subscription setup

1. Go to [razorpay.com](https://razorpay.com) → Sign up (free)
2. Dashboard → **Payment Links** → Create a link for ₹299/month
3. Copy the link and paste into `handlePayment()` in index.html
4. For subscriptions: Dashboard → **Subscriptions** → Create plan → ₹299 monthly
