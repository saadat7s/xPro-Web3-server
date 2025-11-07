use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

// AMM Constants
pub const AMM_POOL_SEED: &[u8] = b"amm_pool";
pub const LP_MINT_SEED: &[u8] = b"lp_mint";
pub const POOL_SOL_VAULT_SEED: &[u8] = b"pool_sol_vault";
pub const POOL_TOKEN_VAULT_SEED: &[u8] = b"pool_token_vault";

// Fee: 0.3% = 3/1000
pub const FEE_NUMERATOR: u64 = 3;
pub const FEE_DENOMINATOR: u64 = 1000;

/// Initialize a new AMM liquidity pool
pub fn initialize_pool(
    ctx: Context<InitializePool>,
    initial_sol_amount: u64,
    initial_token_amount: u64,
) -> Result<()> {
    require!(initial_sol_amount > 0, AmmError::InvalidAmount);
    require!(initial_token_amount > 0, AmmError::InvalidAmount);

    // Get pool account info BEFORE creating mutable reference
    let pool_account_info = ctx.accounts.pool.to_account_info();
    let pool = &mut ctx.accounts.pool;
    pool.token_mint = ctx.accounts.token_mint.key();
    pool.lp_mint = ctx.accounts.lp_mint.key();
    pool.sol_vault = ctx.accounts.sol_vault.key();
    pool.token_vault = ctx.accounts.token_vault.key();
    pool.sol_reserve = initial_sol_amount;
    pool.token_reserve = initial_token_amount;
    pool.lp_supply = 0;
    pool.bump = ctx.bumps.pool;
    pool.is_initialized = true;

    msg!(
        "Pool initialized with {} SOL and {} tokens",
        initial_sol_amount,
        initial_token_amount
    );

    // Transfer SOL from user to pool vault
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.initializer.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, initial_sol_amount)?;

    // Transfer tokens from user to pool vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.initializer_token_account.to_account_info(),
        to: ctx.accounts.token_vault.to_account_info(),
        authority: ctx.accounts.initializer.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, initial_token_amount)?;

    // Calculate and mint initial LP tokens
    // LP = sqrt(sol_amount * token_amount)
    let lp_amount = (initial_sol_amount as f64 * initial_token_amount as f64).sqrt() as u64;

    // Clone necessary values BEFORE updating pool state
    let token_mint_key = ctx.accounts.token_mint.key();
    let pool_bump = ctx.bumps.pool;
    let pool_key = pool.key();

    // NOW update pool state
    pool.lp_supply = lp_amount;

    // Mint LP tokens to initializer (use pool_account_info we got earlier)
    let lp_mint_key = pool.lp_mint;
    let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.lp_mint.to_account_info(),
        to: ctx.accounts.initializer_lp_account.to_account_info(),
        authority: pool_account_info,
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::mint_to(cpi_ctx, lp_amount)?;

    emit!(PoolInitialized {
        pool: pool_key,
        token_mint: token_mint_key,
        lp_mint: lp_mint_key,
        initial_sol: initial_sol_amount,
        initial_tokens: initial_token_amount,
        lp_minted: lp_amount,
    });

    Ok(())
}

/// Add liquidity to an existing pool
pub fn add_liquidity(
    ctx: Context<AddLiquidity>,
    sol_amount: u64,
    max_token_amount: u64,
    min_lp_amount: u64,
) -> Result<()> {
    // Get pool account info BEFORE creating mutable reference
    let pool_account_info = ctx.accounts.pool.to_account_info();
    let pool = &mut ctx.accounts.pool;

    require!(sol_amount > 0, AmmError::InvalidAmount);
    require!(pool.is_initialized, AmmError::PoolNotInitialized);

    // Calculate proportional token amount needed
    let token_amount = (sol_amount as u128)
        .checked_mul(pool.token_reserve as u128)
        .unwrap()
        .checked_div(pool.sol_reserve as u128)
        .unwrap() as u64;

    require!(token_amount <= max_token_amount, AmmError::SlippageExceeded);

    // Calculate LP tokens to mint
    let lp_from_sol = (sol_amount as u128)
        .checked_mul(pool.lp_supply as u128)
        .unwrap()
        .checked_div(pool.sol_reserve as u128)
        .unwrap() as u64;

    let lp_from_token = (token_amount as u128)
        .checked_mul(pool.lp_supply as u128)
        .unwrap()
        .checked_div(pool.token_reserve as u128)
        .unwrap() as u64;

    let lp_amount = std::cmp::min(lp_from_sol, lp_from_token);

    require!(lp_amount >= min_lp_amount, AmmError::SlippageExceeded);

    msg!(
        "Adding liquidity: {} SOL, {} tokens, {} LP tokens",
        sol_amount,
        token_amount,
        lp_amount
    );

    // Transfer SOL from user to pool vault
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, sol_amount)?;

    // Transfer tokens from user to pool vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.token_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, token_amount)?;

    // Clone necessary values for use in CPI
    let token_mint_key = pool.token_mint;
    let pool_bump = pool.bump;
    let pool_key = pool.key();
    let user_key = ctx.accounts.user.key();

    let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];
    let signer_seeds = &[&seeds[..]];

    // Mint LP tokens to user (use pool_account_info we got earlier)
    let cpi_accounts = MintTo {
        mint: ctx.accounts.lp_mint.to_account_info(),
        to: ctx.accounts.user_lp_account.to_account_info(),
        authority: pool_account_info,
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::mint_to(cpi_ctx, lp_amount)?;

    // Update pool reserves AFTER CPI
    pool.sol_reserve = pool.sol_reserve.checked_add(sol_amount).unwrap();
    pool.token_reserve = pool.token_reserve.checked_add(token_amount).unwrap();
    pool.lp_supply = pool.lp_supply.checked_add(lp_amount).unwrap();

    emit!(LiquidityAdded {
        pool: pool_key,
        user: user_key,
        sol_amount,
        token_amount,
        lp_minted: lp_amount,
    });

    Ok(())
}

/// Remove liquidity from pool
pub fn remove_liquidity(
    ctx: Context<RemoveLiquidity>,
    lp_amount: u64,
    min_sol_amount: u64,
    min_token_amount: u64,
) -> Result<()> {
    // Get pool account info BEFORE creating mutable reference
    let pool_account_info = ctx.accounts.pool.to_account_info();
    let pool = &mut ctx.accounts.pool;

    require!(lp_amount > 0, AmmError::InvalidAmount);
    require!(pool.is_initialized, AmmError::PoolNotInitialized);

    // Calculate amounts to return
    let sol_amount = (lp_amount as u128)
        .checked_mul(pool.sol_reserve as u128)
        .unwrap()
        .checked_div(pool.lp_supply as u128)
        .unwrap() as u64;

    let token_amount = (lp_amount as u128)
        .checked_mul(pool.token_reserve as u128)
        .unwrap()
        .checked_div(pool.lp_supply as u128)
        .unwrap() as u64;

    require!(sol_amount >= min_sol_amount, AmmError::SlippageExceeded);
    require!(token_amount >= min_token_amount, AmmError::SlippageExceeded);

    msg!(
        "Removing liquidity: {} LP tokens, {} SOL, {} tokens",
        lp_amount,
        sol_amount,
        token_amount
    );

    // Burn LP tokens from user
    let cpi_accounts = Burn {
        mint: ctx.accounts.lp_mint.to_account_info(),
        from: ctx.accounts.user_lp_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, lp_amount)?;

    // Clone necessary values for use in CPI
    let token_mint_key = pool.token_mint;
    let pool_bump = pool.bump;
    let pool_key = pool.key();
    let user_key = ctx.accounts.user.key();

    let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer SOL back to user
    **ctx
        .accounts
        .sol_vault
        .to_account_info()
        .try_borrow_mut_lamports()? -= sol_amount;
    **ctx
        .accounts
        .user
        .to_account_info()
        .try_borrow_mut_lamports()? += sol_amount;

    // Transfer tokens back to user (use pool_account_info we got earlier)
    let cpi_accounts = Transfer {
        from: ctx.accounts.token_vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: pool_account_info,
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, token_amount)?;

    // Update pool reserves AFTER CPI
    pool.sol_reserve = pool.sol_reserve.checked_sub(sol_amount).unwrap();
    pool.token_reserve = pool.token_reserve.checked_sub(token_amount).unwrap();
    pool.lp_supply = pool.lp_supply.checked_sub(lp_amount).unwrap();

    emit!(LiquidityRemoved {
        pool: pool_key,
        user: user_key,
        sol_amount,
        token_amount,
        lp_burned: lp_amount,
    });

    Ok(())
}

/// Swap SOL for tokens
pub fn swap_sol_for_tokens(
    ctx: Context<SwapSolForTokens>,
    sol_amount: u64,
    min_token_amount: u64,
) -> Result<()> {
    // Get pool account info BEFORE creating mutable reference
    let pool_account_info = ctx.accounts.pool.to_account_info();
    let pool = &mut ctx.accounts.pool;

    require!(sol_amount > 0, AmmError::InvalidAmount);
    require!(pool.is_initialized, AmmError::PoolNotInitialized);

    // Calculate output with 0.3% fee
    let fee_amount = (sol_amount as u128)
        .checked_mul(FEE_NUMERATOR as u128)
        .unwrap()
        .checked_div(FEE_DENOMINATOR as u128)
        .unwrap() as u64;

    let sol_amount_after_fee = sol_amount.checked_sub(fee_amount).unwrap();

    // Constant product formula: x * y = k
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
        "Swapping {} SOL for {} tokens (fee: {} SOL)",
        sol_amount,
        token_amount,
        fee_amount
    );

    // Transfer SOL from user to pool vault
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, sol_amount)?;

    // Clone necessary values for use in CPI
    let token_mint_key = pool.token_mint;
    let pool_bump = pool.bump;
    let pool_key = pool.key();
    let user_key = ctx.accounts.user.key();

    let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];
    let signer_seeds = &[&seeds[..]];

    // Transfer tokens from pool to user (use pool_account_info we got earlier)
    let cpi_accounts = Transfer {
        from: ctx.accounts.token_vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: pool_account_info,
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, token_amount)?;

    // Update reserves AFTER CPI
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

/// Swap tokens for SOL
pub fn swap_tokens_for_sol(
    ctx: Context<SwapTokensForSol>,
    token_amount: u64,
    min_sol_amount: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    require!(token_amount > 0, AmmError::InvalidAmount);
    require!(pool.is_initialized, AmmError::PoolNotInitialized);

    // Calculate output with 0.3% fee
    let fee_amount = (token_amount as u128)
        .checked_mul(FEE_NUMERATOR as u128)
        .unwrap()
        .checked_div(FEE_DENOMINATOR as u128)
        .unwrap() as u64;

    let token_amount_after_fee = token_amount.checked_sub(fee_amount).unwrap();

    // sol_out = (token_in * sol_reserve) / (token_reserve + token_in)
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
        "Swapping {} tokens for {} SOL (fee: {} tokens)",
        token_amount,
        sol_amount,
        fee_amount
    );

    // Transfer tokens from user to pool vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.token_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, token_amount)?;

    // Clone necessary values BEFORE transferring SOL
    let pool_key = pool.key();
    let user_key = ctx.accounts.user.key();

    // Transfer SOL from pool to user
    **ctx
        .accounts
        .sol_vault
        .to_account_info()
        .try_borrow_mut_lamports()? -= sol_amount;
    **ctx
        .accounts
        .user
        .to_account_info()
        .try_borrow_mut_lamports()? += sol_amount;

    // Update reserves AFTER transfers
    pool.sol_reserve = pool.sol_reserve.checked_sub(sol_amount).unwrap();
    pool.token_reserve = pool.token_reserve.checked_add(token_amount).unwrap();

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

// ==================== ACCOUNT STRUCTS ====================

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = initializer,
        space = 8 + AmmPool::LEN,
        seeds = [AMM_POOL_SEED, token_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(
        init,
        payer = initializer,
        mint::decimals = 9,
        mint::authority = pool,
        seeds = [LP_MINT_SEED, token_mint.key().as_ref()],
        bump,
        mint::token_program = token_program
    )]
    pub lp_mint: Account<'info, Mint>,

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
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = initializer_token_account.mint == token_mint.key(),
        constraint = initializer_token_account.owner == initializer.key()
    )]
    pub initializer_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = initializer,
        associated_token::mint = lp_mint,
        associated_token::authority = initializer,
        associated_token::token_program = token_program
    )]
    pub initializer_lp_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = lp_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_lp_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_lp_account.mint == lp_mint.key(),
        constraint = user_lp_account.owner == user.key()
    )]
    pub user_lp_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapSolForTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(
        mut,
        seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
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

    #[account(
        mut,
        seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()],
        bump
    )]
    pub sol_vault: SystemAccount<'info>,

    #[account(mut)]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == pool.token_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ==================== STATE ====================

#[account]
pub struct AmmPool {
    pub token_mint: Pubkey,   // 32
    pub lp_mint: Pubkey,      // 32
    pub sol_vault: Pubkey,    // 32
    pub token_vault: Pubkey,  // 32
    pub sol_reserve: u64,     // 8
    pub token_reserve: u64,   // 8
    pub lp_supply: u64,       // 8
    pub bump: u8,             // 1
    pub is_initialized: bool, // 1
}

impl AmmPool {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

// ==================== EVENTS ====================

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub token_mint: Pubkey,
    pub lp_mint: Pubkey,
    pub initial_sol: u64,
    pub initial_tokens: u64,
    pub lp_minted: u64,
}

#[event]
pub struct LiquidityAdded {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub lp_minted: u64,
}

#[event]
pub struct LiquidityRemoved {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub lp_burned: u64,
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
}
