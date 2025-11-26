# AMM Solana Program

A Solana program (smart contract) implementing an Automated Market Maker (AMM) for decentralized token swaps.

## Overview

This Anchor-based Solana program provides core functionality for:
- Creating AMM instances with configurable fees
- Creating liquidity pools for token pairs
- Adding liquidity to pools
- Swapping tokens through pools
- Withdrawing liquidity from pools

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (latest stable version)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (latest version)
- [Anchor Framework](https://www.anchor-lang.com/docs/installation) (latest version)
- [Yarn](https://yarnpkg.com/) package manager

## Installation

```bash
cd amm
yarn
```

## Building

```bash
# Build the program
anchor build
```

This will:
- Compile the Rust program
- Generate the IDL (Interface Definition Language) file
- Create the program binary (`.so` file)

## Testing

```bash
# Run all tests
anchor test

# Or use yarn directly
yarn test
```

The test suite includes:
- `tests/amm.ts` - AMM creation tests
- `tests/pool.ts` - Pool creation tests
- `tests/add_liquidity.ts` - Liquidity addition tests
- `tests/swap.ts` - Token swap tests
- `tests/withdraw_liquidity.ts` - Liquidity withdrawal tests

## Deployment

### Deploy to Localnet

1. Start a local Solana validator:
```bash
solana-test-validator
```

2. In a new terminal, deploy the program:
```bash
anchor deploy
```

### Deploy to Devnet

```bash
# Set cluster to devnet
solana config set --url devnet

# Airdrop SOL (if needed)
solana airdrop 2

# Deploy
anchor deploy --provider.cluster devnet
```

## Program Instructions

### 1. `create_amm`
Creates a new AMM instance with a fee and index.

**Parameters:**
- `fee`: u16 - Fee in basis points (0-9999, where 10000 = 100%)
- `index`: u16 - Unique identifier for the AMM

**Accounts:**
- `amm`: PDA with seeds `["AMM", index]`
- `admin`: Signer (wallet creating the AMM)
- `system_program`: System program

### 2. `create_pool`
Creates a liquidity pool for a token pair.

**Parameters:**
- `amm`: Pubkey - The AMM this pool belongs to
- `mint_a`: Pubkey - First token mint
- `mint_b`: Pubkey - Second token mint

**Accounts:**
- `pool`: PDA with seeds `["AMM_POOL", amm, mint_a, mint_b]`
- `pool_authority`: PDA with seeds `["AMM_POOL_AUTHORITY", amm, mint_a, mint_b]`
- `mint_liquidity`: PDA with seeds `["AMM_MINT_LIQUIDITY", amm, mint_a, mint_b]`
- `token_account_a`: Token account for mint_a
- `token_account_b`: Token account for mint_b
- `amm`: The AMM account
- `payer`: Signer
- `token_program`: SPL Token program
- `system_program`: System program

### 3. `add_liquidity`
Adds tokens to a liquidity pool and mints LP tokens.

**Parameters:**
- `amount_a`: u64 - Amount of token A to add
- `amount_b`: u64 - Amount of token B to add

**Accounts:**
- `pool`: The pool account
- `pool_authority`: Pool authority PDA
- `mint_liquidity`: LP token mint
- `user_token_account_a`: User's token A account
- `user_token_account_b`: User's token B account
- `pool_token_account_a`: Pool's token A account
- `pool_token_account_b`: Pool's token B account
- `user_lp_token_account`: User's LP token account
- `user`: Signer
- `token_program`: SPL Token program

### 4. `swap`
Swaps tokens through the pool using constant product formula (x * y = k).

**Parameters:**
- `is_swap_a`: bool - If true, swap A to B; if false, swap B to A
- `amount`: u64 - Input amount
- `min_out_amount`: u64 - Minimum output amount (slippage protection)

**Accounts:**
- `pool`: The pool account
- `pool_authority`: Pool authority PDA
- `user_token_account_in`: User's input token account
- `user_token_account_out`: User's output token account
- `pool_token_account_in`: Pool's input token account
- `pool_token_account_out`: Pool's output token account
- `user`: Signer
- `token_program`: SPL Token program

### 5. `withdraw_liquidity`
Removes liquidity from a pool by burning LP tokens.

**Parameters:**
- `amount`: u64 - Amount of LP tokens to burn

**Accounts:**
- `pool`: The pool account
- `pool_authority`: Pool authority PDA
- `mint_liquidity`: LP token mint
- `user_lp_token_account`: User's LP token account
- `pool_token_account_a`: Pool's token A account
- `pool_token_account_b`: Pool's token B account
- `user_token_account_a`: User's token A account
- `user_token_account_b`: User's token B account
- `user`: Signer
- `token_program`: SPL Token program

## Program Structure

```
amm/
├── programs/
│   └── amm/
│       ├── src/
│       │   ├── lib.rs              # Program entry point
│       │   ├── states.rs           # Account structures
│       │   ├── errors.rs           # Custom error types
│       │   └── instructions/       # Instruction handlers
│       │       ├── mod.rs
│       │       ├── create_amm.rs
│       │       ├── create_pool.rs
│       │       ├── add_liquidity.rs
│       │       ├── swap.rs
│       │       └── withdraw_liquidity.rs
│       └── Cargo.toml
├── tests/                          # TypeScript tests
├── migrations/                     # Deployment scripts
├── Anchor.toml                     # Anchor configuration
└── Cargo.toml                      # Rust workspace config
```

## Configuration

The program ID and cluster settings are configured in `Anchor.toml`:

```toml
[programs.localnet]
amm = "264uMZcS5Mcpe5EzAP6P2SoGQE4j7KtpSe6U8mSQZeAN"

[provider]
cluster = "Localnet"
wallet = "./payer.json"
```

## Security Considerations

- **Fee Validation**: Fees are validated to be less than MAX_FEE_BPS (10000)
- **Amount Validation**: All amounts must be greater than zero
- **Balance Checks**: Insufficient balance errors are properly handled
- **Slippage Protection**: Minimum output amounts prevent unfavorable swaps
- **PDA Signing**: Pool authority uses PDA seeds for secure signing

## Development

### Code Formatting

```bash
# Format code
yarn lint:fix

# Check formatting
yarn lint
```

### Generate IDL

The IDL is automatically generated during build. It can be found at:
```
target/idl/amm.json
```

## License

This project is part of the School of Solana curriculum.
