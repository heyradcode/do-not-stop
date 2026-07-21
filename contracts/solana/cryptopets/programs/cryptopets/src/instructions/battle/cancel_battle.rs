use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{
    errors::ErrorCode,
    state::{BattleRequest, GlobalState, FEE_VAULT_SEED},
};

/// Permissionless cleanup (§6 Solana #2): once the committed Switchboard randomness has
/// gone unrevealed for `global_state.randomness_expiry_slots`, anyone may close the stuck
/// `BattleRequest` and refund its rent to the attacker who paid for it.
///
/// Also refunds the escrowed battle fee (mirrors EVM `cancelBattle`'s battleFee refund):
/// no `settle_battle` tx — and therefore no keeper cost — is ever sent for a cancelled
/// request, so there's nothing for the fee to have funded.
pub fn handler(ctx: Context<CancelBattle>) -> Result<()> {
    let clock = Clock::get()?;
    let expiry_slot = ctx
        .accounts
        .battle_request
        .commit_slot
        .checked_add(ctx.accounts.global_state.randomness_expiry_slots)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(clock.slot > expiry_slot, ErrorCode::RandomnessNotExpired);

    let battle_fee = ctx.accounts.battle_request.battle_fee;
    if battle_fee > 0 {
        let signer_seeds: &[&[&[u8]]] = &[&[FEE_VAULT_SEED, &[ctx.bumps.fee_vault]]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.attacker_owner.to_account_info(),
            },
            signer_seeds,
        );
        transfer(cpi_ctx, battle_fee)?;
    }

    emit!(BattleCancelledEvent {
        attacker_owner: ctx.accounts.battle_request.attacker_owner,
        defender_owner: ctx.accounts.battle_request.defender_owner,
        attacker_pet_id: ctx.accounts.battle_request.attacker_pet_id,
        defender_pet_id: ctx.accounts.battle_request.defender_pet_id,
    });

    Ok(())
}

#[event]
pub struct BattleCancelledEvent {
    pub attacker_owner: Pubkey,
    pub defender_owner: Pubkey,
    pub attacker_pet_id: u32,
    pub defender_pet_id: u32,
}

#[derive(Accounts)]
pub struct CancelBattle<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    /// CHECK: rent refund destination for the closed `battle_request`; tied to it via PDA seeds.
    #[account(mut)]
    pub attacker_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = attacker_owner,
        seeds = [BattleRequest::SEED, attacker_owner.key().as_ref()],
        bump = battle_request.bump,
        constraint = battle_request.attacker_owner == attacker_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub battle_request: Account<'info, BattleRequest>,

    #[account(mut, seeds = [FEE_VAULT_SEED], bump)]
    pub fee_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}
