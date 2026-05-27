use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    rarity::Rarity,
    state::{BreedRequest, GlobalState, PetAccount, PlayerProfile},
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
    require!(
        ctx.accounts.child.id == breed_request.child_id,
        ErrorCode::Unauthorized
    );

    let parent1_dna = ctx.accounts.parent1.dna;
    let parent2_dna = ctx.accounts.parent2.dna;

    let vrf = read_revealed_randomness(
        &ctx.accounts.randomness_account_data.to_account_info(),
        breed_request.randomness_account,
        breed_request.commit_slot,
    )?;
    let new_dna = mix_dna_with_vrf(&vrf, parent1_dna, parent2_dna);
    let rarity = Rarity::from_dna(new_dna).into();

    let global_state = &mut ctx.accounts.global_state;
    require!(
        global_state.next_pet_id == breed_request.child_id,
        ErrorCode::BreedRequestNotFound
    );
    global_state.next_pet_id = global_state
        .next_pet_id
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let player_profile = &mut ctx.accounts.player_profile;
    player_profile.pet_count = player_profile
        .pet_count
        .checked_add(1)
        .ok_or(ErrorCode::PetCountOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    let child = &mut ctx.accounts.child;
    child.id = breed_request.child_id;
    child.owner = ctx.accounts.owner.key();
    child.dna = new_dna;
    child.rarity = rarity;
    child.level = 1;
    child.ready_time = now;
    child.win_count = 0;
    child.loss_count = 0;
    child.bump = ctx.bumps.child;
    child.set_name(&breed_request.name())?;

    emit!(BredEvent {
        parent1_id: breed_request.parent1_id,
        parent2_id: breed_request.parent2_id,
        child_id: breed_request.child_id,
    });

    Ok(())
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
