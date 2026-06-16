use anchor_lang::prelude::*;

use crate::{
    errors::ErrorCode,
    state::{mint_fee_for, GlobalState, MintRequest, PetAccount, PlayerProfile, CURRENT_ACCOUNT_VERSION, FEE_VAULT_SEED},
    utils::randomness::assert_randomness_committed,
};

/// Commit phase of the gacha mint (plan §4.3, replaces `create_starter_pet`): charges the
/// per-wallet escalating mint fee (mirrors EVM `mintStarter`'s `walletMintCount`-scaled
/// `baseMintFee`) and commits Switchboard randomness. The pet itself is created in
/// `settle_mint` once the randomness is revealed.
pub fn handler(ctx: Context<CommitMint>, randomness_account: Pubkey, name: String) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);
    require!(
        name.len() <= PetAccount::MAX_NAME_LEN,
        ErrorCode::NameTooLong
    );

    let commit_slot = assert_randomness_committed(
        &ctx.accounts.randomness_account_data.to_account_info(),
        randomness_account,
    )?;

    let player_profile = &mut ctx.accounts.player_profile;
    player_profile.owner = ctx.accounts.owner.key();
    player_profile.version = CURRENT_ACCOUNT_VERSION;
    player_profile.bump = ctx.bumps.player_profile;

    let mint_fee = mint_fee_for(
        player_profile.mint_count,
        ctx.accounts.global_state.base_mint_fee_lamports,
    );
    player_profile.mint_count = player_profile
        .mint_count
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, mint_fee)?;

    let pet_id = ctx.accounts.global_state.next_pet_id;

    let mint_request = &mut ctx.accounts.mint_request;
    mint_request.owner = ctx.accounts.owner.key();
    mint_request.pet_id = pet_id;
    mint_request.randomness_account = randomness_account;
    mint_request.commit_slot = commit_slot;
    mint_request.bump = ctx.bumps.mint_request;
    mint_request.set_name(&name)?;

    emit!(MintCommittedEvent {
        owner: ctx.accounts.owner.key(),
        pet_id,
        randomness_account,
        mint_fee,
    });

    Ok(())
}

#[event]
pub struct MintCommittedEvent {
    pub owner: Pubkey,
    pub pet_id: u32,
    pub randomness_account: Pubkey,
    pub mint_fee: u64,
}

#[derive(Accounts)]
pub struct CommitMint<'info> {
    #[account(seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

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
        seeds = [MintRequest::SEED, owner.key().as_ref()],
        bump,
        space = MintRequest::SPACE,
    )]
    pub mint_request: Account<'info, MintRequest>,

    #[account(mut, seeds = [FEE_VAULT_SEED], bump)]
    pub fee_vault: SystemAccount<'info>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
