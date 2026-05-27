import { prisma } from '../src/db.js';

async function cleanup() {
  console.log('Starting cleanup...');

  // Delete garbage test data
  const result = await prisma.hotspot.deleteMany({
    where: {
      OR: [
        { title: { contains: 'Hotspot' } },
        { relevance: 0 },
        { importance: 'low' }
      ]
    }
  });

  console.log('Deleted:', result.count, 'records');

  // Count remaining data
  const remaining = await prisma.hotspot.count();
  console.log('Remaining hotspots:', remaining);

  // Show stats by source
  const stats = await prisma.hotspot.groupBy({
    by: ['source'],
    _count: true
  });
  console.log('By source:', stats);

  await prisma.$disconnect();
  console.log('Cleanup completed!');
}

cleanup().catch(console.error);
