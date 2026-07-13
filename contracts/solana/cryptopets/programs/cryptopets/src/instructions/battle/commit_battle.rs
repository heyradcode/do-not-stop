use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{BattleRequest, GlobalState, PetAccount},
    utils::metadata::core_asset_owner,
    utils::randomness::assert_randomness_committed,
};

pub fn handler(ctx: Context<CommitBattle>, randomness_account: Pubkey) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(
        ctx.accounts.attacker_pet.key() != ctx.accounts.defender_pet.key(),
        ErrorCode::CannotBattleSelf
    );
    require!(
        ctx.accounts.attacker_owner.key() != ctx.accounts.defender_owner.key(),
        ErrorCode::CannotBattleSameOwner
    );

    let now = Clock::get()?.unix_timestamp;

    {
        require_keys_eq!(
            core_asset_owner(&ctx.accounts.attacker_asset.to_account_info())?,
            ctx.accounts.attacker_owner.key(),
            ErrorCode::Unauthorized
        );
        require_keys_eq!(
            core_asset_owner(&ctx.accounts.defender_asset.to_account_info())?,
            ctx.accounts.defender_owner.key(),
            ErrorCode::Unauthorized
        );

        let attacker_pet = &ctx.accounts.attacker_pet;
        let defender_pet = &ctx.accounts.defender_pet;
        require!(attacker_pet.is_ready(now), ErrorCode::PetNotReady);
        require!(defender_pet.is_ready(now), ErrorCode::PetNotReady);
        require!(
            defender_pet.open_to_challenges,
            ErrorCode::DefenderNotOpenToChallenges
        );

        let gap = attacker_pet.level.abs_diff(defender_pet.level);
        require!(
            gap <= ctx.accounts.global_state.level_band_width,
            ErrorCode::LevelGapTooLarge
        );
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
    // Sim-input snapshot (plan-realtime-battle-solana.md Workstream S1): freeze both pets'
    // stats now so settle_battle can't be rerolled by a level_up (or any other stat change)
    // committed between here and settle.
    battle_request.attacker_dna = ctx.accounts.attacker_pet.dna;
    battle_request.defender_dna = ctx.accounts.defender_pet.dna;
    battle_request.attacker_rarity = ctx.accounts.attacker_pet.rarity;
    battle_request.defender_rarity = ctx.accounts.defender_pet.rarity;
    battle_request.attacker_level = ctx.accounts.attacker_pet.level;
    battle_request.defender_level = ctx.accounts.defender_pet.level;
    battle_request.attacker_species_id = ctx.accounts.attacker_pet.species_id;
    battle_request.defender_species_id = ctx.accounts.defender_pet.species_id;

    let cooldown_seconds = ctx.accounts.global_state.battle_cooldown_seconds;
    ctx.accounts.attacker_pet.trigger_cooldown(now, cooldown_seconds);
    ctx.accounts.defender_pet.trigger_cooldown(now, cooldown_seconds);

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

    /// CHECK: attacker pet's Metaplex Core asset account; PDA seed for `attacker_pet`
    /// and source of truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub attacker_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, attacker_asset.key().as_ref()],
        bump = attacker_pet.bump,
    )]
    pub attacker_pet: Account<'info, PetAccount>,

    /// CHECK: defender wallet pubkey, asserted against `defender_asset`'s current owner.
    pub defender_owner: UncheckedAccount<'info>,

    /// CHECK: defender pet's Metaplex Core asset account; PDA seed for `defender_pet`
    /// and source of truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub defender_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, defender_asset.key().as_ref()],
        bump = defender_pet.bump,
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
