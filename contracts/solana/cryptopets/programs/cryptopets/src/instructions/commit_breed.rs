use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BreedRequest, GlobalState, PetAccount, PlayerProfile},
    util::assert_randomness_committed,
};

pub fn handler(
    ctx: Context<CommitBreed>,
    randomness_account: Pubkey,
    name: String,
) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );
    require!(
        ctx.accounts.parent1.key() != ctx.accounts.parent2.key(),
        ErrorCode::CannotBreedSelf
    );

    let now = Clock::get()?.unix_timestamp;

    let parent1_dna;
    let parent2_dna;
    {
        let p1 = &ctx.accounts.parent1;
        let p2 = &ctx.accounts.parent2;
        require_keys_eq!(p1.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require_keys_eq!(p2.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        require!(p1.is_ready(now), ErrorCode::PetNotReady);
        require!(p2.is_ready(now), ErrorCode::PetNotReady);
        require!(p1.is_breed_ready(now), ErrorCode::PetNotBreedReady);
        require!(p2.is_breed_ready(now), ErrorCode::PetNotBreedReady);
        // One-level incest guard (plan §4.1, mirrors EVM `_validateBreedPair`): neither
        // pet may be a parent of the other.
        require!(
            p1.parent1_id != p2.id
                && p1.parent2_id != p2.id
                && p2.parent1_id != p1.id
                && p2.parent2_id != p1.id,
            ErrorCode::IncestBreedingRejected
        );
        parent1_dna = p1.dna;
        parent2_dna = p2.dna;
    }

    let commit_slot = assert_randomness_committed(
        &ctx.accounts.randomness_account_data.to_account_info(),
        randomness_account,
    )?;

    let child_id = ctx.accounts.global_state.next_pet_id;

    let breed_request = &mut ctx.accounts.breed_request;
    breed_request.owner = ctx.accounts.owner.key();
    breed_request.parent1_id = ctx.accounts.parent1.id;
    breed_request.parent2_id = ctx.accounts.parent2.id;
    breed_request.child_id = child_id;
    breed_request.randomness_account = randomness_account;
    breed_request.commit_slot = commit_slot;
    breed_request.bump = ctx.bumps.breed_request;
    breed_request.set_name(&name)?;

    let cooldown_seconds = ctx.accounts.global_state.battle_cooldown_seconds;
    ctx.accounts.parent1.trigger_cooldown(now, cooldown_seconds);
    ctx.accounts.parent2.trigger_cooldown(now, cooldown_seconds);

    emit!(BreedCommittedEvent {
        owner: ctx.accounts.owner.key(),
        parent1_id: breed_request.parent1_id,
        parent2_id: breed_request.parent2_id,
        child_id,
        randomness_account,
        parent1_dna,
        parent2_dna,
    });

    Ok(())
}

#[event]
pub struct BreedCommittedEvent {
    pub owner: Pubkey,
    pub parent1_id: u32,
    pub parent2_id: u32,
    pub child_id: u32,
    pub randomness_account: Pubkey,
    pub parent1_dna: u64,
    pub parent2_dna: u64,
}

#[derive(Accounts)]
pub struct CommitBreed<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [PlayerProfile::SEED, owner.key().as_ref()],
        bump = player_profile.bump,
    )]
    pub player_profile: Account<'info, PlayerProfile>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &parent1.id.to_le_bytes()],
        bump = parent1.bump,
        constraint = parent1.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent1: Account<'info, PetAccount>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, owner.key().as_ref(), &parent2.id.to_le_bytes()],
        bump = parent2.bump,
        constraint = parent2.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent2: Account<'info, PetAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [BreedRequest::SEED, owner.key().as_ref()],
        bump,
        space = BreedRequest::SPACE,
    )]
    pub breed_request: Account<'info, BreedRequest>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
