use anchor_lang::prelude::*;

pub fn handler(ctx: Context<crate::Initialize>, level_up_fee_lamports: u64) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;

    global_state.admin = ctx.accounts.admin.key();
    global_state.level_up_fee_lamports = level_up_fee_lamports;
    global_state.next_pet_id = 1;
    global_state.paused = false;
    global_state.bump = ctx.bumps.global_state;

    Ok(())
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        seeds = [state::GlobalState::SEED],
        bump,
        space = state::GlobalState::SPACE,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateStarterPet<'info> {
    #[account(
        mut,
        seeds = [state::GlobalState::SEED],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, state::GlobalState>,
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [state::PlayerProfile::SEED, owner.key().as_ref()],
        bump,
        space = state::PlayerProfile::SPACE,
    )]
    pub player_profile: Account<'info, state::PlayerProfile>,
    #[account(
        init,
        payer = owner,
        seeds = [state::PetAccount::SEED, owner.key().as_ref(), &global_state.next_pet_id.to_le_bytes()],
        bump,
        space = state::PetAccount::SPACE,
    )]
    pub zombie: Account<'info, state::PetAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}
