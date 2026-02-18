import request from 'supertest';
import app from '../app';

// Real BNB Chain addresses for testing
const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const VALID_WALLET = '0x1234567890123456789012345678901234567890';

describe('GET /api/risk/:address - Integration Tests', () => {
  describe('Valid BNB contract address', () => {
    let response: request.Response;

    beforeAll(async () => {
      response = await request(app)
        .get(`/api/risk/${PANCAKE_ROUTER}`)
        .expect('Content-Type', /json/);
    }, 60000);

    it('should return 200 status', () => {
      expect(response.status).toBe(200);
    });

    it('should return success true', () => {
      expect(response.body.success).toBe(true);
    });

    it('should return the normalized address', () => {
      expect(response.body.address).toBe(PANCAKE_ROUTER.toLowerCase());
    });

    it('should contain riskScore (0-100)', () => {
      expect(response.body).toHaveProperty('riskScore');
      expect(typeof response.body.riskScore).toBe('number');
      expect(response.body.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.body.riskScore).toBeLessThanOrEqual(100);
    });

    it('should contain contract_risk in breakdown', () => {
      expect(response.body.breakdown).toHaveProperty('contract_risk');
      expect(typeof response.body.breakdown.contract_risk).toBe('number');
    });

    it('should contain behavior_risk in breakdown', () => {
      expect(response.body.breakdown).toHaveProperty('behavior_risk');
      expect(typeof response.body.breakdown.behavior_risk).toBe('number');
    });

    it('should contain reputation_risk in breakdown', () => {
      expect(response.body.breakdown).toHaveProperty('reputation_risk');
      expect(typeof response.body.breakdown.reputation_risk).toBe('number');
    });

    it('should contain rugPullRisk', () => {
      expect(response.body).toHaveProperty('rugPullRisk');
      expect(typeof response.body.rugPullRisk).toBe('number');
    });

    it('should contain explanation object', () => {
      expect(response.body).toHaveProperty('explanation');
      expect(response.body.explanation).toHaveProperty('summary');
      expect(response.body.explanation).toHaveProperty('keyFindings');
      expect(response.body.explanation).toHaveProperty('recommendations');
      expect(response.body.explanation).toHaveProperty('riskFactors');
    });

    it('should contain riskLevel string', () => {
      expect(response.body).toHaveProperty('riskLevel');
      expect(['Very Low', 'Low', 'Medium', 'High', 'Very High']).toContain(response.body.riskLevel);
    });

    it('should contain addressType', () => {
      expect(response.body).toHaveProperty('addressType');
      expect(['wallet', 'contract', 'token']).toContain(response.body.addressType);
    });

    it('should contain legacy components breakdown', () => {
      expect(response.body).toHaveProperty('components');
      expect(response.body.components).toHaveProperty('transactionRisk');
      expect(response.body.components).toHaveProperty('contractRisk');
      expect(response.body.components).toHaveProperty('liquidityRisk');
      expect(response.body.components).toHaveProperty('behavioralRisk');
    });

    it('should contain flags array', () => {
      expect(response.body).toHaveProperty('flags');
      expect(Array.isArray(response.body.flags)).toBe(true);
    });

    it('should contain timestamp', () => {
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should contain analysisTimeMs', () => {
      expect(response.body).toHaveProperty('analysisTimeMs');
      expect(typeof response.body.analysisTimeMs).toBe('number');
      expect(response.body.analysisTimeMs).toBeGreaterThan(0);
    });

    // New Risk Intelligence Engine fields
    it('should contain evidence object with flag categories', () => {
      expect(response.body).toHaveProperty('evidence');
      expect(response.body.evidence).toHaveProperty('contract_flags');
      expect(response.body.evidence).toHaveProperty('onchain_flags');
      expect(response.body.evidence).toHaveProperty('wallet_flags');
      expect(response.body.evidence).toHaveProperty('transparency_flags');
      expect(response.body.evidence).toHaveProperty('scam_flags');
      expect(Array.isArray(response.body.evidence.contract_flags)).toBe(true);
    });

    it('should contain analysis object with sub-modules', () => {
      expect(response.body).toHaveProperty('analysis');
      expect(response.body.analysis).toHaveProperty('contract');
      expect(response.body.analysis).toHaveProperty('onchain');
      expect(response.body.analysis).toHaveProperty('wallet');
      expect(response.body.analysis).toHaveProperty('transparency');
      expect(response.body.analysis).toHaveProperty('scamDatabase');
    });

    it('should contain onchainIndicators array', () => {
      expect(response.body).toHaveProperty('onchainIndicators');
      expect(Array.isArray(response.body.onchainIndicators)).toBe(true);
    });

    it('should contain scoreCalculation transparency', () => {
      expect(response.body).toHaveProperty('scoreCalculation');
      expect(response.body.scoreCalculation).toHaveProperty('formula');
      expect(response.body.scoreCalculation).toHaveProperty('weights');
      expect(response.body.scoreCalculation).toHaveProperty('rawScores');
      expect(response.body.scoreCalculation).toHaveProperty('adjustments');
      expect(response.body.scoreCalculation).toHaveProperty('finalScore');
    });
  });

  describe('Valid wallet address', () => {
    it('should return 200 with valid structure', async () => {
      const response = await request(app)
        .get(`/api/risk/${VALID_WALLET}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('breakdown');
      expect(response.body).toHaveProperty('explanation');
      expect(response.body).toHaveProperty('rugPullRisk');
      expect(response.body).toHaveProperty('evidence');
      expect(response.body).toHaveProperty('analysis');
      expect(response.body).toHaveProperty('scoreCalculation');
    }, 60000);
  });

  describe('Invalid address', () => {
    it('should return 400 for non-hex address', async () => {
      const response = await request(app)
        .get('/api/risk/not-a-valid-address')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for too-short address', async () => {
      const response = await request(app)
        .get('/api/risk/0x1234')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for too-long address', async () => {
      const response = await request(app)
        .get('/api/risk/0x12345678901234567890123456789012345678901234')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for non-hex characters', async () => {
      const response = await request(app)
        .get('/api/risk/0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing 0x prefix', async () => {
      const response = await request(app)
        .get('/api/risk/1234567890123456789012345678901234567890')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Empty address', () => {
    it('should return 404 for empty address with trailing slash', async () => {
      const response = await request(app)
        .get('/api/risk/');

      expect(response.status).toBe(404);
    });

    it('should return 404 for bare risk path', async () => {
      const response = await request(app)
        .get('/api/risk');

      expect(response.status).toBe(404);
    });
  });

  describe('Response format verification', () => {
    it('should return application/json content type', async () => {
      await request(app)
        .get(`/api/risk/${VALID_WALLET}`)
        .expect('Content-Type', /application\/json/);
    }, 60000);

    it('should have breakdown scores in valid range (0-100)', async () => {
      const response = await request(app)
        .get(`/api/risk/${PANCAKE_ROUTER}`)
        .expect(200);

      const { breakdown } = response.body;
      expect(breakdown.contract_risk).toBeGreaterThanOrEqual(0);
      expect(breakdown.contract_risk).toBeLessThanOrEqual(100);
      expect(breakdown.behavior_risk).toBeGreaterThanOrEqual(0);
      expect(breakdown.behavior_risk).toBeLessThanOrEqual(100);
      expect(breakdown.reputation_risk).toBeGreaterThanOrEqual(0);
      expect(breakdown.reputation_risk).toBeLessThanOrEqual(100);
    }, 60000);

    it('should have explanation with non-empty summary', async () => {
      const response = await request(app)
        .get(`/api/risk/${PANCAKE_ROUTER}`)
        .expect(200);

      expect(response.body.explanation.summary.length).toBeGreaterThan(10);
      expect(response.body.explanation.keyFindings.length).toBeGreaterThan(0);
      expect(response.body.explanation.recommendations.length).toBeGreaterThan(0);
    }, 60000);

    it('should have evidence flags with proper structure', async () => {
      const response = await request(app)
        .get(`/api/risk/${PANCAKE_ROUTER}`)
        .expect(200);

      const allFlags = [
        ...response.body.evidence.contract_flags,
        ...response.body.evidence.onchain_flags,
        ...response.body.evidence.wallet_flags,
        ...response.body.evidence.transparency_flags,
        ...response.body.evidence.scam_flags,
      ];

      if (allFlags.length > 0) {
        const flag = allFlags[0];
        expect(flag).toHaveProperty('id');
        expect(flag).toHaveProperty('name');
        expect(flag).toHaveProperty('severity');
        expect(flag).toHaveProperty('description');
        expect(flag).toHaveProperty('evidence');
        expect(flag).toHaveProperty('category');
        expect(flag).toHaveProperty('riskWeight');
      }
    }, 60000);
  });

  describe('Address normalization', () => {
    it('should normalize mixed-case addresses', async () => {
      const mixedCase = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
      const response = await request(app)
        .get(`/api/risk/${mixedCase}`)
        .expect(200);

      expect(response.body.address).toBe(mixedCase.toLowerCase());
    }, 60000);
  });

  describe('Unknown routes', () => {
    it('should return 404 for unknown API routes', async () => {
      await request(app)
        .get('/api/unknown')
        .expect(404);
    });
  });
});
