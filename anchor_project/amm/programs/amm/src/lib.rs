use anchor_lang::prelude::*;

mod errors;
pub mod instructions;
pub mod states;

declare_id!("264uMZcS5Mcpe5EzAP6P2SoGQE4j7KtpSe6U8mSQZeAN");

#[program]
pub mod amm {
    pub use super::instructions::*;
    use super::*;

    pub fn create_amm(ctx: Context<CreateAmm>, fee: u16, index: u16) -> Result<()> {
        instructions::create_amm(ctx, fee, index)
    }

    pub fn create_pool(ctx: Context<CreatePool>) -> Result<()> {
        instructions::create_pool(ctx)
    }

    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
        instructions::add_liquidity(ctx, amount_a, amount_b)
    }

    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, amount: u64) -> Result<()> {
        instructions::withdraw_liquidity(ctx, amount)
    }

    pub fn swap(
        ctx: Context<Swap>,
        is_swap_a: bool,
        amount: u64,
        min_out_amount: u64,
    ) -> Result<()> {
        instructions::swap(ctx, is_swap_a, amount, min_out_amount)
    }
}
