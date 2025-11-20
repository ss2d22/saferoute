async function monitor() {
  const baseUrl = 'http://localhost:8000/api/v1/crime-ingestion/progress';

  while (true) {
    try {
      const response = await fetch(baseUrl);
      const data = await response.json() as any;

      const percentage = ((data.completed / data.total) * 100).toFixed(1);
      console.log(`[${new Date().toISOString()}] Progress: ${data.completed}/${data.total} (${percentage}%) - Status: ${data.status}`);

      if (data.completed === data.total || data.status === 'completed') {
        console.log('✓ Ingestion complete!');
        break;
      }

      if (data.status === 'failed') {
        console.log('✗ Ingestion failed!');
        break;
      }

      // Wait 10 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error: any) {
      console.error('Error checking progress:', error.message);
      break;
    }
  }
}

monitor();
