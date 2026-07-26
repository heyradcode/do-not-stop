import express, { Router } from 'express';

import { getReceiptsByPet, getReceiptsBySequence, getReceiptsByWallet } from '@features/battle-ledger';

/**
 * The public receipt corpus (§H item 3): paginated export by pet, by wallet, and
 * by signing-key sequence range. Deliberately no `verifyToken` anywhere in this
 * file — public replay needs no special access, and gating this behind a JWT
 * would make it a corpus only account holders could use to check our work.
 */
const router: Router = express.Router();

router.get('/by-pet/:chainId/:petId', getReceiptsByPet);
router.get('/by-wallet/:wallet', getReceiptsByWallet);
router.get('/', getReceiptsBySequence);

export default router;
