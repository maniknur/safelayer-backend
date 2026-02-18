import app from './app';
import logger from './utils/logger';
import { getOpenClawManager } from './openclaw';

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = app.listen(PORT, async () => {
  logger.info(`SafeLayer BNB Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Rate limit: ${process.env.RATE_LIMIT_MAX || '30'} requests per minute`);

  // Initialize and start OpenClaw agents
  try {
    const manager = getOpenClawManager();
    await manager.initialize();
    await manager.startAll();
  } catch (error) {
    logger.error('Failed to start OpenClaw agents', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');

  try {
    // Stop agents first
    const manager = getOpenClawManager();
    await manager.stopAll();
  } catch (error) {
    logger.warn('Error stopping agents during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;
