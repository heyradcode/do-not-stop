import 'dotenv/config';
import { prisma } from '../config/prisma';

/**
 * Dev-only: seed a handful of opponent pets so `GET /api/battle/opponents`
 * returns data before subgraph URLs are configured.
 *
 * Run: pnpm --filter backend seed:roster
 */
const now = Math.floor(Date.now() / 1000);

const demoPets = [
    { chain: 'evm', petId: '101', owner: '0xfa11deadbeef00000000000000000000000000ff', name: 'Cinder', level: 2, rarity: 1, dna: '8473920184756', winCount: 3, lossCount: 1 },
    { chain: 'evm', petId: '102', owner: '0xb0bb0000000000000000000000000000000b0b00', name: 'Nimbus', level: 5, rarity: 2, dna: '99120384756102', winCount: 8, lossCount: 2 },
    { chain: 'evm', petId: '103', owner: '0xcafe000000000000000000000000000000cafe00', name: 'Volt', level: 9, rarity: 3, dna: '55501928374650', winCount: 14, lossCount: 5 },
    { chain: 'solana', petId: '7', owner: 'So1aNaWa11etPubKey1111111111111111111111111', name: 'Pixel', level: 3, rarity: 1, dna: '120394857', winCount: 2, lossCount: 0 },
    { chain: 'solana', petId: '8', owner: 'So1aNaWa11etPubKey2222222222222222222222222', name: 'Echo', level: 6, rarity: 2, dna: '987654321', winCount: 6, lossCount: 4 },
];

async function main() {
    for (const pet of demoPets) {
        await prisma.petRoster.upsert({
            where: { chain_petId: { chain: pet.chain, petId: pet.petId } },
            create: { ...pet, readyAt: BigInt(now) },
            update: { ...pet, readyAt: BigInt(now) },
        });
    }
    const total = await prisma.petRoster.count();
    console.log(`✅ Seeded ${demoPets.length} demo pets. Roster now has ${total} rows.`);
}

main()
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
