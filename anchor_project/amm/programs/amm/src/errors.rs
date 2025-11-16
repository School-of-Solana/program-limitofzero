use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Mint accounts should be different")]
    MintAccountsAreEqual,
    #[msg("Amount of the token should be greater than zero")]
    AmountIsZero,
    #[msg("Insufficient balance to deposit")]
    InsufficientBalance,
    #[msg("One of the pools has zero tokens")]
    InvalidPoolState,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("LP amount is zero")]
    LpIsZero,
}
