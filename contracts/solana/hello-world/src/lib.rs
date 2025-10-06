use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111"); // This will be updated when deployed

#[program]
pub mod hello_world {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let hello_world = &mut ctx.accounts.hello_world;
        hello_world.owner = ctx.accounts.owner.key();
        hello_world.message = "Hello, Solana!".to_string();
        hello_world.count = 0;
        Ok(())
    }

    pub fn update_message(ctx: Context<UpdateMessage>, new_message: String) -> Result<()> {
        let hello_world = &mut ctx.accounts.hello_world;
        hello_world.message = new_message;
        hello_world.count += 1;
        Ok(())
    }

    pub fn get_message(ctx: Context<GetMessage>) -> Result<String> {
        let hello_world = &ctx.accounts.hello_world;
        Ok(hello_world.message.clone())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 4 + 100 + 8, // discriminator + owner + message length + message + count
        seeds = [b"hello_world", owner.key().as_ref()],
        bump
    )]
    pub hello_world: Account<'info, HelloWorld>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMessage<'info> {
    #[account(
        mut,
        has_one = owner
    )]
    pub hello_world: Account<'info, HelloWorld>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetMessage<'info> {
    pub hello_world: Account<'info, HelloWorld>,
}

#[account]
pub struct HelloWorld {
    pub owner: Pubkey,
    pub message: String,
    pub count: u64,
}
