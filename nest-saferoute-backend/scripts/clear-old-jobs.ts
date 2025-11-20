import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';

dotenv.config();

async function clearOldJobs() {
  const queue = new Queue('crime-ingestion', {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    },
  });

  try {
    console.log('Clearing old crime ingestion jobs...');

    // Clear all jobs in all states
    await queue.obliterate({ force: true });

    console.log('✓ All old jobs cleared');
  } catch (error) {
    console.error('Failed to clear old jobs:', error);
    process.exit(1);
  } finally {
    await queue.close();
  }
}

clearOldJobs();
