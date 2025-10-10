use anchor_lang::prelude::*;

declare_id!("BJ6fL2BsUqkRbqXEeQ4mQ6HLens4jYEqmwQg3yFkbSrF");

#[program]
pub mod cryptozombies {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
