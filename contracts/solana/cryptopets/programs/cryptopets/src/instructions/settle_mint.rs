use anchor_lang::prelude::*;

use crate::{
    dna::resolve_species,
    errors::ErrorCode,
    rarity::Rarity,
    state::{GlobalState, MintRequest, PetAccount, PlayerProfile, CURRENT_ACCOUNT_VERSION},
    util::{mint_dna_from_vrf, read_revealed_randomness},
};

/// Settle phase of the gacha mint (plan §4.3): derives DNA purely from the revealed VRF
/// (no parent influence, unlike `settle_breed`), mints the pet at generation 0 / level 1,
/// and — unlike bred pets — leaves it battle/breed/train-ready immediately (no newborn
/// cooldown; that lockout is bred-pet-only per §4.2).
pub fn handler(ctx: Context<SettleMint>) -> Result<()> {
    require!(!ctx.accounts.global_state.paused, ErrorCode::Paused);

    let mint_request = &ctx.accounts.mint_request;
    require_keys_eq!(
        mint_request.owner,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );

    let vrf = read_revealed_randomness(
        &ctx.accounts.randomness_account_data.to_account_info(),
        mint_request.randomness_account,
        mint_request.commit_slot,
    )?;
    let dna = mint_dna_from_vrf(&vrf);
    let rarity: u8 = Rarity::from_dna(dna).into();

    let global_state = &mut ctx.accounts.global_state;
    require!(
        global_state.next_pet_id == mint_request.pet_id,
        ErrorCode::MintRequestNotFound
    );
    global_state.next_pet_id = global_state
        .next_pet_id
        .checked_add(1)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let pool_sizes = global_state.pool_sizes;

    let player_profile = &mut ctx.accounts.player_profile;
    player_profile.pet_count = player_profile
        .pet_count
        .checked_add(1)
        .ok_or(ErrorCode::PetCountOverflow)?;

    let now = Clock::get()?.unix_timestamp;

    let pet = &mut ctx.accounts.pet;
    pet.id = mint_request.pet_id;
    pet.owner = ctx.accounts.owner.key();
    pet.dna = dna;
    pet.rarity = rarity;
    pet.level = 1;
    pet.ready_time = now;
    pet.win_count = 0;
    pet.loss_count = 0;
    pet.version = CURRENT_ACCOUNT_VERSION;
    pet.bump = ctx.bumps.pet;
    pet.open_to_challenges = true;
    pet.set_name(&mint_request.name())?;

    pet.generation = 0;
    pet.parent1_id = 0;
    pet.parent2_id = 0;
    pet.breed_count = 0;
    pet.breed_ready_time = 0;
    pet.train_ready_time = 0;
    pet.species_id = resolve_species(dna, rarity, &pool_sizes);

    emit!(MintedEvent {
        owner: ctx.accounts.owner.key(),
        pet_id: pet.id,
        dna,
        rarity,
        species_id: pet.species_id,
    });

    Ok(())
}

#[event]
pub struct MintedEvent {
    pub owner: Pubkey,
    pub pet_id: u32,
    pub dna: u64,
    pub rarity: u8,
    pub species_id: u16,
}

#[derive(Accounts)]
pub struct SettleMint<'info> {
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
        init,
        payer = owner,
        seeds = [
            PetAccount::SEED,
            owner.key().as_ref(),
            &mint_request.pet_id.to_le_bytes(),
        ],
        bump,
        space = PetAccount::SPACE,
    )]
    pub pet: Account<'info, PetAccount>,

    #[account(
        mut,
        close = owner,
        seeds = [MintRequest::SEED, owner.key().as_ref()],
        bump = mint_request.bump,
        constraint = mint_request.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub mint_request: Account<'info, MintRequest>,

    /// CHECK: parsed as Switchboard `RandomnessAccountData` in the handler.
    pub randomness_account_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}
