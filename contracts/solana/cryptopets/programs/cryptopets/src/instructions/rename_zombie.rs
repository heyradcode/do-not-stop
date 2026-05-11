use anchor_lang::prelude::*;

use crate::{errors::ErrorCode, state::ZombieAccount};

pub fn handler(ctx: Context<crate::RenameZombie>, name: String) -> Result<()> {
    require!(name.len() <= ZombieAccount::MAX_NAME_LEN, ErrorCode::NameTooLong);

    let zombie = &mut ctx.accounts.zombie;

    require_keys_eq!(zombie.owner, ctx.accounts.owner.key(), ErrorCode::Unauthorized);

    zombie.set_name(&name)?;

    Ok(())
}
