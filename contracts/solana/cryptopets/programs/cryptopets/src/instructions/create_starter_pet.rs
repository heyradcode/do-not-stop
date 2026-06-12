use anchor_lang::{
    prelude::*,
    solana_program::{keccak, sysvar::slot_hashes},
};

use crate::{
    dna::resolve_species,
    errors::ErrorCode,
    rarity::Rarity,
    state::{GlobalState, PetAccount, PlayerProfile, CURRENT_ACCOUNT_VERSION},
};

pub fn handler(ctx: Context<CreateStarterPet>, name: String) -> Result<()> {
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );

    let global_state = &mut ctx.accounts.global_state;
    let player_profile = &mut ctx.accounts.player_profile;
    let pet = &mut ctx.accounts.pet;

    // enforce pause
    require!(!global_state.paused, ErrorCode::Paused);

    require!(
        !player_profile.starter_created,
        ErrorCode::StarterAlreadyCreated
    );

    player_profile.owner = ctx.accounts.owner.key();
    player_profile.starter_created = true;
    player_profile.pet_count = player_profile.pet_count.checked_add(1).unwrap();
    player_profile.version = CURRENT_ACCOUNT_VERSION;
    player_profile.bump = ctx.bumps.player_profile;

    let pet_id = global_state.next_pet_id;
    global_state.next_pet_id = global_state.next_pet_id.checked_add(1).unwrap();

    // Interim Phase-0 clamp (§6 Solana #1): DNA is derived on-chain from the
    // SlotHashes sysvar + payer + pet id, never client-supplied, and rarity is
    // forced to Common. The Phase 3 VRF gacha mint replaces this entirely.
    let dna = starter_dna(&ctx.accounts.recent_slothashes, ctx.accounts.owner.key(), pet_id)?;

    pet.id = pet_id;
    pet.owner = ctx.accounts.owner.key();
    pet.dna = dna;
    pet.rarity = Rarity::Common.into();
    pet.level = 1;
    pet.ready_time = Clock::get()?.unix_timestamp;
    pet.win_count = 0;
    pet.loss_count = 0;
    pet.version = CURRENT_ACCOUNT_VERSION;
    pet.bump = ctx.bumps.pet;
    pet.open_to_challenges = true;
    pet.set_name(&name)?;

    // Phase 3 lineage (plan §4): starters are gen-0 with no parents and start with
    // both non-battle cooldowns ready immediately.
    pet.generation = 0;
    pet.parent1_id = 0;
    pet.parent2_id = 0;
    pet.breed_count = 0;
    pet.breed_ready_time = 0;
    pet.train_ready_time = 0;
    pet.species_id = resolve_species(pet.dna, pet.rarity, &global_state.pool_sizes);

    Ok(())
}

/// Mixes the most recent `SlotHashes` entry with the payer and pet id into a u64.
/// Grindable by validators (no VRF), but no longer chosen by the caller.
fn starter_dna(recent_slothashes: &AccountInfo, owner: Pubkey, pet_id: u32) -> Result<u64> {
    let data = recent_slothashes.try_borrow_data()?;
    // SlotHashes layout: 8-byte little-endian vec length, then (slot: u64, hash: [u8; 32])
    // entries, most recent first.
    let mut preimage = [0u8; 32 + 32 + 4];
    preimage[0..32].copy_from_slice(&data[16..48]);
    preimage[32..64].copy_from_slice(owner.as_ref());
    preimage[64..68].copy_from_slice(&pet_id.to_le_bytes());

    let digest = keccak::hash(&preimage).to_bytes();
    Ok(u64::from_le_bytes(digest[0..8].try_into().unwrap()))
}

#[derive(Accounts)]
pub struct CreateStarterPet<'info> {
    #[account(
        mut,
        seeds = [GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [PlayerProfile::SEED, owner.key().as_ref()],
        bump,
        space = PlayerProfile::SPACE,
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    #[account(
        init,
        payer = owner,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &global_state.next_pet_id.to_le_bytes()],
        bump,
        space = PetAccount::SPACE,
    )]
    pub pet: Account<'info, PetAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: validated by `address` constraint; parsed manually for the most recent slot hash.
    #[account(address = slot_hashes::ID)]
    pub recent_slothashes: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
