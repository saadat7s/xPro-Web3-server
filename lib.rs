use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self as token, Mint, MintTo, TokenAccount, TransferChecked,
};

declare_id!("3LrvyGuyhsgPWrbQqZcKzSQeMAxCoZgTCmYxmT2FWfAJ");

// ==================== BONDING CURVE MEME LAUNCHPAD ====================
//
// This contract implements a pump.fun-style bonding curve for meme tokens:
//
// 1. MINT TOKEN (0.01 SOL):
//    - Creates SPL Token-2022 with 1B supply (9 decimals)
//    - 0.1% (1M tokens) → Creator wallet
//    - 99.9% (999M tokens) → Protocol vault
//
// 2. INITIALIZE POOL:
//    - Transfers tokens from vault to pool
//    - User provides SOL to set initial price
//    - Creates constant product bonding curve (x * y = k)
//
// 3. BUY/SELL:
//    - Users trade directly with pool (no LP tokens)
//    - 0.3% fee on each trade
//    - Price adjusts automatically via AMM formula
//
// NO LP TOKENS: This is a bonding curve, not traditional liquidity provision
//
// ===========================================================================

// ==================== CONSTANTS ====================

// Mint fee: 0.01 SOL (10,000,000 lamports)
pub const MINT_FEE_LAMPORTS: u64 = 10_000_000;

// AMM Constants
pub const AMM_POOL_SEED: &[u8] = b"amm_pool";
pub const POOL_SOL_VAULT_SEED: &[u8] = b"pool_sol_vault";
pub const POOL_TOKEN_VAULT_SEED: &[u8] = b"pool_token_vault";
pub const FEE_NUMERATOR: u64 = 3;
pub const FEE_DENOMINATOR: u64 = 1000;

// ==================== PROGRAM ====================

#[program]
pub mod meme_launchpad {
    use super::*;

    // ==================== PROTOCOL MANAGEMENT ====================

    pub fn initialize_protocol_state(ctx: Context<InitializeProtocolState>) -> Result<()> {
        let state = &mut ctx.accounts.protocol_state;
        state.authority = ctx.accounts.authority.key();
        state.fee_lamports = MINT_FEE_LAMPORTS; // Fixed at 0.01 SOL
        state.bump = ctx.bumps.protocol_state;

        emit!(ProtocolInitialized {
            authority: ctx.accounts.authority.key(),
            fee_vault: ctx.accounts.fee_vault.key(),
            fee_lamports: MINT_FEE_LAMPORTS,
        });

        Ok(())
    }

    // ==================== TOKEN MINTING ====================

    pub fn mint_meme_token(ctx: Context<MintMemeToken>, meme_id: [u8; 32]) -> Result<()> {
        let protocol_state = &ctx.accounts.protocol_state;

        require!(
            !ctx.accounts.meme_token_state.is_initialized,
            ErrorCode::MemeAlreadyMinted
        );

        // Transfer protocol fee
        transfer_native_sol_fee(&ctx.accounts, protocol_state.fee_lamports)?;

        // Distribute supply
        distribute_supply(&ctx)?;

        // Update MemeTokenState
        let meme_token_state = &mut ctx.accounts.meme_token_state;
        meme_token_state.meme_id = meme_id;
        meme_token_state.mint = ctx.accounts.mint.key();
        meme_token_state.minter = ctx.accounts.minter.key();
        meme_token_state.created_at = Clock::get()?.unix_timestamp;
        meme_token_state.is_initialized = true;
        meme_token_state.bump = ctx.bumps.meme_token_state;

        emit!(Minted {
            meme_id,
            minter: ctx.accounts.minter.key(),
            mint_addr: ctx.accounts.mint.key(),
        });

        Ok(())
    }

    // ==================== AMM POOL FUNCTIONS ====================

    pub fn initialize_amm_pool(
        ctx: Context<InitializePool>,
        initial_sol_amount: u64,
        initial_token_amount: u64,
    ) -> Result<()> {
        require!(initial_sol_amount > 0, AmmError::InvalidAmount);
        require!(initial_token_amount > 0, AmmError::InvalidAmount);

        let token_mint_key = ctx.accounts.token_mint.key();

        // Derive PDAs
        let (sol_vault_pda, _) = Pubkey::find_program_address(
            &[POOL_SOL_VAULT_SEED, token_mint_key.as_ref()],
            ctx.program_id,
        );
        let (token_vault_pda, _) = Pubkey::find_program_address(
            &[POOL_TOKEN_VAULT_SEED, token_mint_key.as_ref()],
            ctx.program_id,
        );

        // Initialize pool state
        let pool = &mut ctx.accounts.pool;
        pool.token_mint = token_mint_key;
        pool.sol_vault = sol_vault_pda;
        pool.token_vault = token_vault_pda;
        pool.sol_reserve = initial_sol_amount;
        pool.token_reserve = initial_token_amount;
        pool.bump = ctx.bumps.pool;
        pool.is_initialized = true;

        msg!(
            "Pool initialized with {} SOL and {} tokens",
            initial_sol_amount,
            initial_token_amount
        );

        // Transfer tokens FROM minting vault TO pool
        msg!(
            "Transferring {} tokens from minting vault to pool",
            initial_token_amount
        );

        let vault_seeds = &[b"vault", token_mint_key.as_ref(), &[ctx.bumps.vault]];
        let signer_seeds = &[&vault_seeds[..]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            ),
            initial_token_amount,
            9,
        )?;

        msg!("✅ Tokens transferred from vault to pool successfully");

        // Transfer SOL from initializer to pool
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.initializer.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            initial_sol_amount,
        )?;

        emit!(PoolInitialized {
            pool: pool.key(),
            token_mint: token_mint_key,
            initial_sol: initial_sol_amount,
            initial_tokens: initial_token_amount,
        });

        Ok(())
    }

    pub fn swap_sol_to_tokens(
        ctx: Context<SwapSolForTokens>,
        sol_amount: u64,
        min_token_amount: u64,
    ) -> Result<()> {
        let pool_account_info = ctx.accounts.pool.to_account_info();
        let pool = &mut ctx.accounts.pool;

        require!(sol_amount > 0, AmmError::InvalidAmount);
        require!(pool.is_initialized, AmmError::PoolNotInitialized);

        // Calculate output with fee
        let fee_amount = (sol_amount as u128)
            .checked_mul(FEE_NUMERATOR as u128)
            .unwrap()
            .checked_div(FEE_DENOMINATOR as u128)
            .unwrap() as u64;
        let sol_amount_after_fee = sol_amount.checked_sub(fee_amount).unwrap();
        let token_amount = (sol_amount_after_fee as u128)
            .checked_mul(pool.token_reserve as u128)
            .unwrap()
            .checked_div(
                (pool.sol_reserve as u128)
                    .checked_add(sol_amount_after_fee as u128)
                    .unwrap(),
            ).unwrap() as u64;

        require!(token_amount >= min_token_amount, AmmError::SlippageExceeded);
        require!(
            token_amount < pool.token_reserve,
            AmmError::InsufficientLiquidity
        );

        msg!(
            "Swapping {} SOL for {} tokens (fee: {})",
            sol_amount,
            token_amount,
            fee_amount
        );

        // Transfer SOL
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.sol_vault.to_account_info(),
                },
            ),
            sol_amount,
        )?;

        // Transfer tokens
        let token_mint_key = pool.token_mint;
        let pool_bump = pool.bump;
        let pool_key = pool.key();
        let user_key = ctx.accounts.user.key();
        let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    authority: pool_account_info,
                },
                &[&seeds[..]],
            ),
            token_amount,
            9,
        )?;

        // Update reserves
        pool.sol_reserve = pool.sol_reserve.checked_add(sol_amount).unwrap();
        pool.token_reserve = pool.token_reserve.checked_sub(token_amount).unwrap();

        emit!(SwapExecuted {
            pool: pool_key,
            user: user_key,
            input_token: "SOL".to_string(),
            input_amount: sol_amount,
            output_amount: token_amount,
            fee: fee_amount,
        });

        Ok(())
    }

    // ✅ FIXED: Proper SOL transfer from vault to user using invoke_signed
    pub fn swap_tokens_to_sol(
        ctx: Context<SwapTokensForSol>,
        token_amount: u64,
        min_sol_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(token_amount > 0, AmmError::InvalidAmount);
        require!(pool.is_initialized, AmmError::PoolNotInitialized);

        // Calculate output with fee
        let fee_amount = (token_amount as u128)
            .checked_mul(FEE_NUMERATOR as u128)
            .unwrap()
            .checked_div(FEE_DENOMINATOR as u128)
            .unwrap() as u64;
        let token_amount_after_fee = token_amount.checked_sub(fee_amount).unwrap();
        let sol_amount = (token_amount_after_fee as u128)
            .checked_mul(pool.sol_reserve as u128)
            .unwrap()
            .checked_div(
                (pool.token_reserve as u128)
                    .checked_add(token_amount_after_fee as u128)
                    .unwrap(),
            ).unwrap() as u64;

        require!(sol_amount >= min_sol_amount, AmmError::SlippageExceeded);
        require!(
            sol_amount < pool.sol_reserve,
            AmmError::InsufficientLiquidity
        );

        msg!(
            "Swapping {} tokens for {} SOL (fee: {})",
            token_amount,
            sol_amount,
            fee_amount
        );

        // Transfer tokens from user to pool
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            token_amount,
            9,
        )?;

        // ✅ FIXED: Transfer SOL from vault to user using proper system program CPI
        // The sol_vault is a PDA, so we need to use the pool's authority
        let token_mint_key = pool.token_mint;
        let pool_bump = pool.bump;
        
        // Create PDA signer seeds for the pool
        let pool_seeds = &[
            AMM_POOL_SEED,
            token_mint_key.as_ref(),
            &[pool_bump],
        ];
        let pool_signer = &[&pool_seeds[..]];

        // However, sol_vault is derived differently, so we need its seeds
        let sol_vault_seeds = &[
            POOL_SOL_VAULT_SEED,
            token_mint_key.as_ref(),
        ];
        let (sol_vault_pda, sol_vault_bump) = Pubkey::find_program_address(sol_vault_seeds, ctx.program_id);
        
        // Verify we have the right vault
        require_keys_eq!(
            sol_vault_pda,
            ctx.accounts.sol_vault.key(),
            AmmError::InvalidVault
        );

        // Create vault signer seeds
        let vault_signer_seeds = &[
            POOL_SOL_VAULT_SEED,
            token_mint_key.as_ref(),
            &[sol_vault_bump],
        ];
        let vault_signer = &[&vault_signer_seeds[..]];

        // Transfer SOL from sol_vault to user using system program with PDA signing
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.sol_vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                vault_signer,
            ),
            sol_amount,
        )?;

        // Update reserves
        pool.sol_reserve = pool.sol_reserve.checked_sub(sol_amount).unwrap();
        pool.token_reserve = pool.token_reserve.checked_add(token_amount).unwrap();

        let pool_key = pool.key();
        let user_key = ctx.accounts.user.key();

        emit!(SwapExecuted {
            pool: pool_key,
            user: user_key,
            input_token: "TOKEN".to_string(),
            input_amount: token_amount,
            output_amount: sol_amount,
            fee: fee_amount,
        });

        Ok(())
    }
}

// ==================== HELPER FUNCTIONS ====================

fn transfer_native_sol_fee(accounts: &MintMemeToken, fee_lamports: u64) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: accounts.minter.to_account_info(),
                to: accounts.fee_vault.to_account_info(),
            },
        ),
        fee_lamports,
    )
}

fn distribute_supply(ctx: &Context<MintMemeToken>) -> Result<()> {
    const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000;
    // 0.1% to minter
    let minter_share = TOTAL_SUPPLY / 1000;
    let vault_share = TOTAL_SUPPLY - minter_share;

    let mint_key = ctx.accounts.mint.key();
    let vault_seeds: &[&[u8]] = &[b"vault", mint_key.as_ref(), &[ctx.bumps.vault]];
    let signer_seeds = &[vault_seeds];

    // Mint to minter
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.minter_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        minter_share,
    )?;

    // Mint to vault
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        vault_share,
    )
}

// ==================== ACCOUNT STRUCTS ====================

#[derive(Accounts)]
pub struct InitializeProtocolState<'info> {
    #[account(init_if_needed, payer = authority, space = 128, seeds = [b"protocol_state_v2"], bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"fee_vault"], bump)]
    pub fee_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(meme_id: [u8; 32])]
pub struct MintMemeToken<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,
    #[account(init, payer = minter, space = 8 + 32 + 32 + 32 + 8 + 1 + 1, seeds = [b"meme_token_state", meme_id.as_ref()], bump)]
    pub meme_token_state: Account<'info, MemeTokenState>,
    #[account(init, payer = minter, mint::decimals = 9, mint::authority = vault, mint::freeze_authority = vault, seeds = [b"meme_mint", meme_id.as_ref()], bump, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(seeds = [b"vault", mint.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = minter, associated_token::mint = mint, associated_token::authority = minter, associated_token::token_program = token_program)]
    pub minter_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(init_if_needed, payer = minter, associated_token::mint = mint, associated_token::authority = vault, associated_token::token_program = token_program)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"fee_vault"], bump)]
    pub fee_vault: UncheckedAccount<'info>,
    #[account(seeds = [b"protocol_state_v2"], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = initializer,
        space = 8 + AmmPool::LEN,
        seeds = [AMM_POOL_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(
        mut,
        seeds = [POOL_SOL_VAULT_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(
        init,
        payer = initializer,
        token::mint = token_mint,
        token::authority = pool,
        seeds = [POOL_TOKEN_VAULT_SEED, token_mint.key().as_ref()],
        bump,
        token::token_program = token_program
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Minting vault PDA - validated by seeds
    #[account(
        seeds = [b"vault", token_mint.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: Vault's token account - we only read from it for transfer
    #[account(mut)]
    pub vault_token_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapSolForTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, AmmPool>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()], bump)]
    pub sol_vault: SystemAccount<'info>,
    #[account(mut)]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_token_account.mint == pool.token_mint, constraint = user_token_account.owner == user.key())]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapTokensForSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, AmmPool>,

    pub token_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: SOL vault PDA - validated by seeds in instruction
    #[account(
        mut,
        seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(mut)]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

// ==================== STATE STRUCTS ====================

#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub fee_lamports: u64,
    pub bump: u8,
}

#[account]
pub struct MemeTokenState {
    pub meme_id: [u8; 32],
    pub mint: Pubkey,
    pub minter: Pubkey,
    pub created_at: i64,
    pub is_initialized: bool,
    pub bump: u8,
}

#[account]
pub struct AmmPool {
    pub token_mint: Pubkey,
    pub sol_vault: Pubkey,
    pub token_vault: Pubkey,
    pub sol_reserve: u64,
    pub token_reserve: u64,
    pub bump: u8,
    pub is_initialized: bool,
}

impl AmmPool {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 1 + 1;
}

// ==================== EVENTS ====================

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub fee_vault: Pubkey,
    pub fee_lamports: u64,
}

#[event]
pub struct Minted {
    pub meme_id: [u8; 32],
    pub minter: Pubkey,
    pub mint_addr: Pubkey,
}

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub token_mint: Pubkey,
    pub initial_sol: u64,
    pub initial_tokens: u64,
}

#[event]
pub struct SwapExecuted {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub input_token: String,
    pub input_amount: u64,
    pub output_amount: u64,
    pub fee: u64,
}

// ==================== ERRORS ====================

#[error_code]
pub enum ErrorCode {
    #[msg("Meme already minted")]
    MemeAlreadyMinted,
}

#[error_code]
pub enum AmmError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Pool not initialized")]
    PoolNotInitialized,
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
    #[msg("Insufficient liquidity in pool")]
    InsufficientLiquidity,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid vault")]
    InvalidVault,
}