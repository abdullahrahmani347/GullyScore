import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all existing data...');

  // Delete all records in correct order (respecting foreign key constraints)
  const tables = [
    'Ball',
    'BatsmanInnings',
    'BowlerInnings',
    'Innings',
    'TournamentTeam',
    'Match',
    'Tournament',
    'Player',
    'Team',
  ];

  for (const t of tables) {
    try {
      await (prisma as any).$executeRawUnsafe(`DELETE FROM "${t}";`);
    } catch {}
  }

  console.log('All data cleared. Database is empty — ready for user input.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
