# 🚀 SafeLayer Backend - Railway Deployment Guide

## ✅ Current Status

- ✅ **TypeScript Compilation**: 0 errors
- ✅ **Test Suite**: 37/37 tests passing
- ✅ **Server**: Starts successfully on port 3001
- ✅ **Dependencies**: All installed (449 packages)
- ✅ **Build**: Ready for production

---

## 📋 Quick Deployment Steps

### Option 1: GitHub-to-Railway (Recommended)

1. **Connect GitHub** to Railway:
   - Go to https://railway.app
   - Sign in with GitHub
   - Click "Create New" → "Project from GitHub repo"
   - Select `safelayer-backend` repository

2. **Set Environment Variables** in Railway:
   ```
   PORT=3001
   NODE_ENV=production
   CORS_ORIGIN=https://your-frontend-url.vercel.app
   BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
   REGISTRY_CONTRACT_ADDRESS=0x20B28a7b961a6d82222150905b0C01256607B5A3
   BSCSCAN_API_KEY=<your-key>
   RATE_LIMIT_MAX=30
   ```

3. **Deploy**:
   - Railway will auto-detect Node.js app
   - Build: `npm install && npm run build`
   - Start: `npm start`
   - Health check: `/health`

### Option 2: Railway CLI

```bash
# Login
railway login

# Initialize in project directory
railway init

# Deploy
railway up

# View logs
railway logs
```

---

## 💰 Cost Protection (< $3/month)

- Monthly free tier credit: **$5 USD**
- Estimated monthly usage: **$0-1 USD**
- Resource limits: **Memory 256MB, CPU shared**
- Budget alert: Set to **$2.50**

See `COST_ANALYSIS.md` for detailed breakdown.

---

## 🔍 Verify Deployment

```bash
# Check health
curl https://your-railway-domain.com/health

# Expected response:
# {
#   "success": true,
#   "status": "ok",
#   "timestamp": "2026-02-18T...",
#   "uptime": 123.456,
#   "version": "1.1.0"
# }
```

---

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check `npm install` and `npm run build` locally |
| Server won't start | Verify PORT env var and check Railway logs |
| Health check fails | Ensure `/health` endpoint is accessible |
| High memory | Reduce log verbosity, check for memory leaks |
| High costs | Check auto-scaling is disabled, review logs |

---

## 📊 Deployment Checklist

- [ ] GitHub account linked to Railway
- [ ] Environment variables configured
- [ ] Database (if needed): PostgreSQL add-on ~$12/month
- [ ] Budget alert set to $2.50
- [ ] Auto-scaling disabled
- [ ] Health checks enabled
- [ ] Domain configured (Railway provides free `.railway.app` domain)
- [ ] Logs accessible in Railway dashboard
- [ ] Team has access to Railway project

---

## 📚 Resources

- Railway Docs: https://docs.railway.app
- GitHub Integration: https://docs.railway.app/develop/github-integration
- Environment Variables: https://docs.railway.app/develop/variables
- Pricing: https://railway.app/pricing

---

## 🎯 Next Actions

1. Create Railway account at https://railway.app
2. Connect GitHub repository
3. Configure environment variables
4. Deploy and monitor
5. Set budget alerts
6. Review logs after 24-48 hours
