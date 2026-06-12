use anchor_lang::prelude::*;
use mpl_core::{
    instructions::CreateV1CpiBuilder,
    types::{Attributes, Plugin, PluginAuthorityPair},
};

use crate::{
    dna::resolve_species,
    errors::ErrorCode,
    metadata::pet_attributes,
    state::{
        BreedRequest, GlobalState, PetAccount, StudFeeAccount, BREED_COOLDOWN_CAP_SECONDS,
        CURRENT_ACCOUNT_VERSION,
    },
    util::{core_asset_owner, inherit_rarity, mix_dna_with_vrf, read_revealed_randomness},
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
    // Child is `init` here, with its PDA seeded by the fresh `asset` keypair (plan
    // §2.3/v2.1 Phase A re-seed); its id is assigned below at settle time.

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
    let rarity = inherit_rarity(
        ctx.accounts.parent1.rarity,
        ctx.accounts.parent2.rarity,
        new_dna,
        &vrf,
    );

    let global_state = &mut ctx.accounts.global_state;
    require!(
        child_generation <= global_state.generation_cap,
        ErrorCode::GenerationCapReached
    );
    // The child id is assigned now, not at commit (mirrors EVM `settleBreed`'s
    // `createPet`): concurrent commits all record the same provisional `next_pet_id`
    // as `child_id`, so requiring it to still match here would permanently brick
    // every settle but the first. Settle-time assignment is safe because the id is
    // no longer a PDA seed (plan §2.3/v2.1 Phase A re-seed).
    let child_id = global_state.next_pet_id;
    global_state.next_pet_id = global_state
        .next_pet_id
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let breed_cooldown_base = global_state.breed_cooldown_base_seconds;
    let newborn_cooldown = global_state.newborn_cooldown_seconds;
    let pool_sizes = global_state.pool_sizes;

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
    child.id = child_id;
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
    // breed/train-ready immediately.
    child.generation = child_generation;
    child.parent1_id = breed_request.parent1_id;
    child.parent2_id = breed_request.parent2_id;
    child.breed_count = 0;
    child.breed_ready_time = 0;
    child.train_ready_time = 0;
    child.species_id = resolve_species(new_dna, rarity, &pool_sizes);

    // mpl-core CPI: mint the child as a Core asset into the "CryptoPets" collection (plan
    // §2.3/v2.1 Phase A), attaching the Attributes plugin with its display traits. The
    // GlobalState PDA is the collection's update authority and signs this CPI via
    // `invoke_signed` (it does not sign the outer transaction). See `settle_mint`'s CPI
    // for the same pattern.
    //
    // UNVERIFIED: `CreateV1CpiBuilder`'s method names/shapes (`asset`/`collection`/
    // `authority`/`payer`/`owner`/`update_authority`/`system_program`/`name`/`uri`/
    // `plugins`/`invoke_signed`), plus `PluginAuthorityPair`/`Plugin::Attributes`/
    // `Attributes`'s field shapes, follow the usual mpl-core ~0.10 CPI convention but have
    // not been checked against the real crate (no cargo registry cache or Rust toolchain
    // in this environment). Fix up against `mpl_core::instructions::CreateV1CpiBuilder`
    // and `mpl_core::types` when building.
    let global_state_seeds: &[&[u8]] = &[GlobalState::SEED, &[global_state.bump]];
    CreateV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .authority(Some(&global_state.to_account_info()))
        .payer(&ctx.accounts.owner.to_account_info())
        .owner(Some(&ctx.accounts.owner.to_account_info()))
        .update_authority(Some(&global_state.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(child.name())
        .uri(String::new())
        .plugins(vec![PluginAuthorityPair {
            plugin: Plugin::Attributes(Attributes {
                attribute_list: pet_attributes(new_dna, child.species_id, rarity, child.level, child.generation),
            }),
            authority: None,
        }])
        .invoke_signed(&[global_state_seeds])?;

    child.asset = ctx.accounts.asset.key();

    // The stud fee becomes withdrawable only now (plan §4.4, mirrors EVM
    // `settleBreed`'s `pendingStudFees[p.otherOwner] += p.studFee`). The lamports were
    // parked in `other_owner`'s `StudFeeAccount` PDA at `commit_breed`; crediting the
    // withdrawable `amount` before settlement would let `other_owner` drain the escrow
    // while the breed was still pending, leaving an expired request's `cancel_breed`
    // refund permanently underfunded.
    let stud_fee = breed_request.stud_fee;
    if stud_fee > 0 {
        let (expected_stud_fee_account, _bump) = Pubkey::find_program_address(
            &[StudFeeAccount::SEED, breed_request.other_owner.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.stud_fee_account.key(),
            expected_stud_fee_account,
            ErrorCode::InvalidStudFeeAccount
        );

        let stud_fee_account_info = ctx.accounts.stud_fee_account.to_account_info();
        let mut stud_fee_data: Account<StudFeeAccount> =
            Account::try_from(&stud_fee_account_info)?;
        stud_fee_data.amount = stud_fee_data
            .amount
            .checked_add(stud_fee)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        stud_fee_data.exit(ctx.program_id)?;
    }

    emit!(BredEvent {
        parent1_id: breed_request.parent1_id,
        parent2_id: breed_request.parent2_id,
        child_id,
        other_owner: breed_request.other_owner,
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
    /// Recipient of the escrowed stud fee (plan §4.4, mirrors EVM `BreedSettled`'s
    /// `studFeePaidTo`); `Pubkey::default()` for same-owner breeds.
    pub other_owner: Pubkey,
}

#[derive(Accounts)]
pub struct SettleBreed<'info> {
    #[account(mut, seeds = [GlobalState::SEED], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: address-constrained to the Metaplex Core program; invoked via CPI to mint
    /// the child's asset.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    /// Fresh keypair for the child's Metaplex Core asset account (plan §2.3/v2.1 Phase A),
    /// created via the CPI below. Its pubkey is recorded in `child.asset` and is `child`'s
    /// PDA seed.
    #[account(mut)]
    pub asset: Signer<'info>,

    /// CHECK: the "CryptoPets" collection account (`global_state.collection`); updated by
    /// the CPI below to register the new asset.
    #[account(mut, address = global_state.collection)]
    pub collection: UncheckedAccount<'info>,

    /// CHECK: parent1's Metaplex Core asset account; PDA seed for `parent1` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub parent1_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, parent1_asset.key().as_ref()],
        bump = parent1.bump,
        constraint = core_asset_owner(&parent1_asset.to_account_info())? == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent1: Account<'info, PetAccount>,

    /// CHECK: parent2's owner pubkey (plan §4.4). Equal to `owner` for same-owner breeds,
    /// or `breed_request.other_owner` for cross-owner breeds.
    #[account(
        constraint = (breed_request.other_owner == Pubkey::default()
            && parent2_owner.key() == owner.key())
            || (breed_request.other_owner != Pubkey::default()
                && parent2_owner.key() == breed_request.other_owner)
            @ ErrorCode::Unauthorized,
    )]
    pub parent2_owner: UncheckedAccount<'info>,

    /// CHECK: parent2's Metaplex Core asset account; PDA seed for `parent2` and source of
    /// truth for ownership (plan §2.3/v2.1 Phase A).
    #[account(owner = mpl_core::ID)]
    pub parent2_asset: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [PetAccount::SEED, parent2_asset.key().as_ref()],
        bump = parent2.bump,
        constraint = core_asset_owner(&parent2_asset.to_account_info())? == parent2_owner.key() @ ErrorCode::Unauthorized,
    )]
    pub parent2: Account<'info, PetAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [PetAccount::SEED, asset.key().as_ref()],
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

    /// CHECK: stud-fee escrow PDA for `breed_request.other_owner` (plan §4.4); validated
    /// against the expected PDA address in the handler when `breed_request.stud_fee > 0`.
    /// Unused (any writable account may be passed) for same-owner breeds.
    #[account(mut)]
    pub stud_fee_account: UncheckedAccount<'info>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
