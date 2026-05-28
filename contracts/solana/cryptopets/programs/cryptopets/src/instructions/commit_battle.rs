use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BattleRequest, GlobalState, PetAccount},
    util::assert_randomness_committed,
};

pub fn handler(ctx: Context<CommitBattle>, randomness_account: Pubkey) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(
        ctx.accounts.attacker_pet.key() != ctx.accounts.defender_pet.key(),
        ErrorCode::CannotBattleSelf
    );

    let now = Clock::get()?.unix_timestamp;

    {
        let attacker_pet = &ctx.accounts.attacker_pet;
        let defender_pet = &ctx.accounts.defender_pet;
        require_keys_eq!(
            attacker_pet.owner,
            ctx.accounts.attacker_owner.key(),
            ErrorCode::Unauthorized
        );
        require_keys_eq!(
            defender_pet.owner,
            ctx.accounts.defender_owner.key(),
            ErrorCode::Unauthorized
        );
        require!(attacker_pet.is_ready(now), ErrorCode::PetNotReady);
        require!(defender_pet.is_ready(now), ErrorCode::PetNotReady);
    }

    let commit_slot = assert_randomness_committed(
        &ctx.accounts.randomness_account_data.to_account_info(),
        randomness_account,
    )?;

    let battle_request = &mut ctx.accounts.battle_request;
    battle_request.attacker_owner = ctx.accounts.attacker_owner.key();
    battle_request.defender_owner = ctx.accounts.defender_owner.key();
    battle_request.attacker_pet_id = ctx.accounts.attacker_pet.id;
    battle_request.defender_pet_id = ctx.accounts.defender_pet.id;
    battle_request.randomness_account = randomness_account;
    battle_request.commit_slot = commit_slot;
    battle_request.bump = ctx.bumps.battle_request;

    ctx.accounts.attacker_pet.trigger_cooldown(now);
    ctx.accounts.defender_pet.trigger_cooldown(now);

    emit!(BattleCommittedEvent {
        attacker_owner: battle_request.attacker_owner,
        defender_owner: battle_request.defender_owner,
        attacker_pet_id: battle_request.attacker_pet_id,
        defender_pet_id: battle_request.defender_pet_id,
        randomness_account,
    });

    Ok(())
}

#[event]
pub struct BattleCommittedEvent {
    pub attacker_owner: Pubkey,
    pub defender_owner: Pubkey,
    pub attacker_pet_id: u32,
    pub defender_pet_id: u32,
    pub randomness_account: Pubkey,
}

#[derive(Accounts)]
pub struct CommitBattle<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub attacker_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            attacker_owner.key().as_ref(),
            &attacker_pet.id.to_le_bytes(),
        ],
        bump = attacker_pet.bump,
        constraint = attacker_pet.owner == attacker_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub attacker_pet: Account<'info, PetAccount>,

    /// CHECK: defender wallet pubkey is used as a PDA seed for `defender_pet`.
    pub defender_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [
            PetAccount::SEED,
            defender_owner.key().as_ref(),
            &defender_pet.id.to_le_bytes(),
        ],
        bump = defender_pet.bump,
        constraint = defender_pet.owner == defender_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub defender_pet: Account<'info, PetAccount>,

    #[account(
        init,
        payer = attacker_owner,
        seeds = [BattleRequest::SEED, attacker_owner.key().as_ref()],
        bump,
        space = BattleRequest::SPACE,
    )]
    pub battle_request: Account<'info, BattleRequest>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
