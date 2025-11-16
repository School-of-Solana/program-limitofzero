use crate::errors::AmmError;
use crate::states::{AmmPool, AMM_MINT_LIQUIDITY_SEED, AMM_POOL_AUTHORITY_SEED, AMM_POOL_SEED};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64) -> Result<()> {
    require!(amount_a > 0 || amount_b > 0, AmmError::AmountIsZero);

    let depositor_account_a = &ctx.accounts.depositor_account_a;
    let depositor_account_b = &ctx.accounts.depositor_account_b;

    require!(
        depositor_account_a.amount >= amount_a && depositor_account_b.amount >= amount_b,
        AmmError::AmountIsZero
    );

    Ok(())
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        seeds = [AMM_POOL_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool: Box<Account<'info, AmmPool>>,

    pub mint_a: Box<Account<'info, Mint>>,

    pub mint_b: Box<Account<'info, Mint>>,

    /// CHECK readonly
    #[account(
        seeds=[AMM_POOL_AUTHORITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [AMM_MINT_LIQUIDITY_SEED.as_bytes(), pool.amm.as_ref(), pool.mint_a.key().as_ref(), pool.mint_b.key().as_ref()],
        bump,
    )]
    pub mint_liquidity: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = authority
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = authority
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,

    pub depositor: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_liquidity,
        associated_token::authority = authority,
    )]
    pub depositor_account_liquidity: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = depositor
    )]
    pub depositor_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = depositor
    )]
    pub depositor_account_b: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
