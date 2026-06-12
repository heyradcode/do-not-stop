use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    rarity::Rarity,
    state::{
        BreedRequest, GlobalState, PetAccount, PlayerProfile, BREED_COOLDOWN_CAP_SECONDS,
        CURRENT_ACCOUNT_VERSION,
    },
    util::{mix_dna_with_vrf, read_revealed_randomness},
};

pub fn handler(ctx: Context<SettleBreed>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let breed_request = &ctx.accounts.breed_request;
    require_keys_eq!(
        breed_request.owner,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.parent1.id == breed_request.parent1_id,
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.parent2.id == breed_request.parent2_id,
        ErrorCode::Unauthorized
    );
    // Child is `init` here — id is assigned below. PDA seeds already bind the account
    // to `breed_request.child_id`.

    let parent1_dna = ctx.accounts.parent1.dna;
    let parent2_dna = ctx.accounts.parent2.dna;
    // Lineage (plan §4.2): child generation is one past the older parent's generation.
    let child_generation = ctx
        .accounts
        .parent1
        .generation
        .max(ctx.accounts.parent2.generation)
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let vrf = read_revealed_randomness(
        &ctx.accounts.randomness_account_data.to_account_info(),
        breed_request.randomness_account,
        breed_request.commit_slot,
    )?;
    let new_dna = mix_dna_with_vrf(&vrf, parent1_dna, parent2_dna);
    let rarity = Rarity::from_dna(new_dna).into();

    let global_state = &mut ctx.accounts.global_state;
    require!(
        child_generation <= global_state.generation_cap,
        ErrorCode::GenerationCapReached
    );
    require!(
        global_state.next_pet_id == breed_request.child_id,
        ErrorCode::BreedRequestNotFound
    );
    global_state.next_pet_id = global_state
        .next_pet_id
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let breed_cooldown_base = global_state.breed_cooldown_base_seconds;
    let newborn_cooldown = global_state.newborn_cooldown_seconds;

    let player_profile = &mut ctx.accounts.player_profile;
    player_profile.pet_count = player_profile
        .pet_count
        .checked_add(1)
        .ok_or(ErrorCode::PetCountOverflow)?;

    let now = Clock::get()?.unix_timestamp;

    // Breed cooldown curve (plan §4.1, mirrors EVM `_breedCooldownFor` +
    // `triggerBreedCooldown` + `incrementBreedCount`): cooldown is computed from each
    // parent's *current* breed_count, then both counts are incremented.
    let cd1 = breed_cooldown_for(ctx.accounts.parent1.breed_count, breed_cooldown_base);
    let cd2 = breed_cooldown_for(ctx.accounts.parent2.breed_count, breed_cooldown_base);
    ctx.accounts.parent1.trigger_breed_cooldown(now, cd1);
    ctx.accounts.parent2.trigger_breed_cooldown(now, cd2);
    ctx.accounts.parent1.breed_count = ctx.accounts.parent1.breed_count.saturating_add(1);
    ctx.accounts.parent2.breed_count = ctx.accounts.parent2.breed_count.saturating_add(1);

    let child = &mut ctx.accounts.child;
    child.id = breed_request.child_id;
    child.owner = ctx.accounts.owner.key();
    child.dna = new_dna;
    child.rarity = rarity;
    child.level = 1;
    // Newborn cooldown (plan §4.2, mirrors EVM `setCooldown(childId, newbornCooldown())`):
    // bred pets start with a battle lockout instead of being immediately battle-ready.
    child.ready_time = now.saturating_add(newborn_cooldown);
    child.win_count = 0;
    child.loss_count = 0;
    child.version = CURRENT_ACCOUNT_VERSION;
    child.bump = ctx.bumps.child;
    child.open_to_challenges = true;
    child.set_name(&breed_request.name())?;

    // Phase 3 lineage (plan §4.2): record parentage and generation. The child starts
    // breed/train-ready immediately; species resolution is wired in a later step.
    child.generation = child_generation;
    child.parent1_id = breed_request.parent1_id;
    child.parent2_id = breed_request.parent2_id;
    child.breed_count = 0;
    child.breed_ready_time = 0;
    child.train_ready_time = 0;
    child.species_id = 0;

    emit!(BredEvent {
        parent1_id: breed_request.parent1_id,
        parent2_id: breed_request.parent2_id,
        child_id: breed_request.child_id,
    });

    Ok(())
}

/// Breed cooldown curve (plan §4.1, mirrors EVM `GameLogicV1._breedCooldownFor`):
/// `base_seconds << breed_count`, capped at [`BREED_COOLDOWN_CAP_SECONDS`].
/// Clamp the shift to 31: `breed_count` (u8) can reach 255, and `i64 << 64` panics with
/// `overflow-checks = true`; shifts beyond ~20 already exceed the cap regardless of base.
fn breed_cooldown_for(breed_count: u8, base_seconds: i64) -> i64 {
    let cd = base_seconds << (breed_count as u32).min(31);
    cd.min(BREED_COOLDOWN_CAP_SECONDS)
}

#[event]
pub struct BredEvent {
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
}

#[derive(Accounts)]
pub struct SettleBreed<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PlayerProfile::SEED, owner.key().as_ref()],
        bump = player_profile.bump,
    )]
    pub player_profile: Account<'info, PlayerProfile>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            owner.key().as_ref(),
            &breed_request.parent1_id.to_le_bytes(),
        ],
        bump = parent1.bump,
        constraint = parent1.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent1: Account<'info, PetAccount>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            owner.key().as_ref(),
            &breed_request.parent2_id.to_le_bytes(),
        ],
        bump = parent2.bump,
        constraint = parent2.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent2: Account<'info, PetAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [
            PetAccount::SEED,
            owner.key().as_ref(),
            &breed_request.child_id.to_le_bytes(),
        ],
        bump,
        space = PetAccount::SPACE,
    )]
    pub child: Account<'info, PetAccount>,

    #[account(
        mut,
        close = owner,
        seeds = [BreedRequest::SEED, owner.key().as_ref()],
        bump = breed_request.bump,
        constraint = breed_request.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub breed_request: Account<'info, BreedRequest>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
