# SafeLayer Backend

> AI-powered risk intelligence engine for BNB Chain. Analyze wallets and smart contracts with evidence-based scoring.

## Features

- **5-Module Risk Analysis Engine**
  - Contract Scanner: Smart contract code analysis
  - On-chain Behavior Analyzer: Transaction history & patterns
  - Scam Database Checker: Known scam detection
  - Wallet History Checker: Holder analysis
  - Transparency Checker: Open source verification

- **On-Chain Registry**: Immutable risk scores stored on-chain
- **Parallel Processing**: Fast analysis with concurrent module execution
- **Rate Limiting**: Protection against abuse (30 requests/minute default)
- **CORS Support**: Safe cross-origin access for frontend

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.22
- **Language**: TypeScript 5.9
- **Blockchain**: ethers.js 6.16 (BNB Chain interaction)
- **Testing**: Jest

## Quick Start (Local)

```bash
# Install dependencies
npm ci

# Create .env file
cp .env.example .env
# Edit .env with your values

# Build
npm run build

# Start development server
npm run dev

# Run tests
npm test
```

Environment variables required:
```
PORT=3001
NODE_ENV=development
BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
REGISTRY_CONTRACT_ADDRESS=0x20B28a7b961a6d82222150905b0C01256607B5A3
CORS_ORIGIN=http://localhost:3000
BSCSCAN_API_KEY=(optional)
ANALYZER_PRIVATE_KEY=(optional - test mode OK)
RATE_LIMIT_MAX=30
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Risk Analysis
```bash
GET /api/risk/:address
```

Response:
```json
{
  "target": "0x...",
  "riskScore": 65,
  "riskLevel": "medium",
  "recommendation": "review_first",
  "details": {
    "contractScanner": 85,
    "behaviorAnalyzer": 60,
    "scamDatabaseChecker": 45,
    "walletHistoryChecker": 70,
    "transparencyChecker": 55
  }
}
```

### Registry Query
```bash
GET /api/registry/info
GET /api/registry/:address
```

## Deployment

### Railway (Recommended)

1. **Create Railway Account**: https://railway.app
2. **Deploy from GitHub**:
   - New Project → Deploy from GitHub repo
   - Select `safelayer-backend`
3. **Set Environment Variables** in Railway dashboard:
   ```
   NODE_ENV=production
   PORT=3001
   BNB_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
   REGISTRY_CONTRACT_ADDRESS=0x20B28a7b961a6d82222150905b0C01256607B5A3
   CORS_ORIGIN=https://safelayer.vercel.app
   BSCSCAN_API_KEY=your_key
   ANALYZER_PRIVATE_KEY=your_key (optional)
   RATE_LIMIT_MAX=30
   ```
4. **Generate Domain**: Settings → Networking → Generate Domain
5. **Test**: `curl https://your-domain.up.railway.app/health`

### Configuration Files

- **`nixpacks.toml`**: Build configuration (npm ci → npm run build → npm start)
- **`railway.json`**: Railway deployment config (healthcheck, restart policy)
- **`.gitignore`**: Excludes dist/, node_modules/, .env files

### Cost Control

- **Free Tier**: $5 credit/month on Railway
- **Spending Limits**: Set in Account Settings → Billing
  - Hard Limit: $5
  - Alert: $3
- **Memory Usage**: ~80-120 MB (safe for free tier)
- **Sleep on Idle**: Enable in Railway project settings

## Project Structure

```
src/
├── app.ts              # Express app setup + CORS
├── index.ts            # Server entry point
├── modules/            # Core analysis modules
│   ├── aggregator/     # Risk aggregation engine
│   ├── onchain/        # Behavior analysis
│   ├── scam/           # Scam detection
│   ├── scanner/        # Contract analysis
│   └── transparency/   # Open source check
├── routes/             # API endpoints
├── services/           # External integrations
└── utils/              # Helpers & validation
```

## Testing

```bash
# Run all tests
npm test

# Run specific test
npm test -- api.integration.test.ts

# Watch mode
npm test -- --watch
```

## Security

- ✅ Environment variables for secrets (never commit .env)
- ✅ CORS whitelist (only allowed origins)
- ✅ Rate limiting enabled
- ✅ Input validation on all routes
- ✅ Error handling without exposing internals

## Community & Support

- **GitHub Issues**: Report bugs or request features
- **Documentation**: See [DEPLOY.md](../DEPLOY.md) for full deployment guide

## License

MIT

---

**Live URL** (after deployment): https://safelayer-backend.up.railway.app
