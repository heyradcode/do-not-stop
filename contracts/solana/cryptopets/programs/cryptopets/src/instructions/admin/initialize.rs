use crate::{
    errors::ErrorCode,
    state::{
        GlobalState, PetAccount, CURRENT_ACCOUNT_VERSION, DEFAULT_BASE_MINT_FEE_LAMPORTS,
        DEFAULT_BATTLE_COOLDOWN_SECONDS, DEFAULT_BATTLE_FEE_LAMPORTS,
        DEFAULT_BREED_COOLDOWN_BASE_SECONDS,
        DEFAULT_BREED_FEE_LAMPORTS, DEFAULT_GENERATION_CAP, DEFAULT_LEVEL_BAND_WIDTH,
        DEFAULT_MARRIAGE_COOLDOWN_SECONDS, DEFAULT_MAX_LEVEL, DEFAULT_NEWBORN_COOLDOWN_SECONDS,
        DEFAULT_POOL_SIZE, DEFAULT_PROPOSAL_TTL_SECONDS, DEFAULT_RANDOMNESS_EXPIRY_SLOTS,
        DEFAULT_STUD_FEE_LAMPORTS, DEFAULT_TRAIN_COOLDOWN_SECONDS, DEFAULT_TRAIN_FEE_LAMPORTS,
        DEFAULT_TRAIN_XP,
    },
};
use anchor_lang::prelude::*;
use mpl_core::instructions::CreateCollectionV1CpiBuilder;

pub fn handler(ctx: Context<Initialize>, level_up_fee_lamports: u64) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    global_state.admin = ctx.accounts.admin.key();
    global_state.level_up_fee_lamports = level_up_fee_lamports;
    global_state.battle_cooldown_seconds = DEFAULT_BATTLE_COOLDOWN_SECONDS;
    global_state.randomness_expiry_slots = DEFAULT_RANDOMNESS_EXPIRY_SLOTS;
    global_state.max_level = DEFAULT_MAX_LEVEL;
    global_state.level_band_width = DEFAULT_LEVEL_BAND_WIDTH;
    global_state.generation_cap = DEFAULT_GENERATION_CAP;
    global_state.breed_cooldown_base_seconds = DEFAULT_BREED_COOLDOWN_BASE_SECONDS;
    global_state.newborn_cooldown_seconds = DEFAULT_NEWBORN_COOLDOWN_SECONDS;
    global_state.pool_sizes = [DEFAULT_POOL_SIZE; 5];
    global_state.base_mint_fee_lamports = DEFAULT_BASE_MINT_FEE_LAMPORTS;
    global_state.train_fee_lamports = DEFAULT_TRAIN_FEE_LAMPORTS;
    global_state.train_cooldown_seconds = DEFAULT_TRAIN_COOLDOWN_SECONDS;
    global_state.train_xp = DEFAULT_TRAIN_XP;
    global_state.breed_fee_lamports = DEFAULT_BREED_FEE_LAMPORTS;
    global_state.battle_fee_lamports = DEFAULT_BATTLE_FEE_LAMPORTS;
    global_state.stud_fee_lamports = DEFAULT_STUD_FEE_LAMPORTS;
    global_state.marriage_cooldown_seconds = DEFAULT_MARRIAGE_COOLDOWN_SECONDS;
    global_state.proposal_ttl_seconds = DEFAULT_PROPOSAL_TTL_SECONDS;
    // Metaplex Core "CryptoPets" collection (plan §2.3/v2.1 Phase A): records the address
    // of the fresh keypair that backs the collection account created by the
    // `CreateCollectionV1` CPI below.
    global_state.collection = ctx.accounts.collection.key();
    global_state.next_pet_id = 1;
    global_state.paused = false;
    global_state.version = CURRENT_ACCOUNT_VERSION;
    global_state.bump = ctx.bumps.global_state;

    // mpl-core CPI: create the "CryptoPets" collection (plan §2.3/v2.1 Phase A). The
    // GlobalState PDA is recorded as the update authority; update authorities are stored
    // as data on the collection account, not required to sign, so a plain `.invoke()`
    // suffices here -- no `invoke_signed`/PDA seeds needed.
    //
    // UNVERIFIED: the builder name (`CreateCollectionV1CpiBuilder`), its method names
    // (`collection`/`update_authority`/`payer`/`system_program`/`name`/`uri`/`invoke`),
    // and the `Option<&AccountInfo>` vs `&AccountInfo` argument shapes follow the usual
    // mpl-core ~0.10 CPI builder convention but have not been checked against the real
    // crate (no cargo registry cache or Rust toolchain in this environment). Fix up
    // against `mpl_core::instructions::CreateCollectionV1CpiBuilder` when building.
    CreateCollectionV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .update_authority(Some(&global_state.to_account_info()))
        .payer(&ctx.accounts.admin.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name("CryptoPets".to_string())
        .uri(String::new())
        .invoke()?;

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [GlobalState::SEED],
        bump,
        space = GlobalState::SPACE,
    )]
    pub global_state: Account<'info, GlobalState>,

    /// Fresh keypair for the new Metaplex Core "CryptoPets" collection account (plan
    /// §2.3/v2.1 Phase A), created via the CPI below. Its pubkey is recorded in
    /// `global_state.collection`.
    #[account(mut)]
    pub collection: Signer<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: address-constrained to the Metaplex Core program; invoked via CPI to
    /// create the collection.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
