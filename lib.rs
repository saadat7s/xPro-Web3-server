use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{
    self as token, Burn, Mint, MintTo, TokenAccount, TransferChecked,
};

declare_id!("23YiQzmDxCYcX8Vu9Fkbov2NoFfUJCjNhKTH2GFfRDyM");

// ==================== AMM CONSTANTS ====================

pub const AMM_POOL_SEED: &[u8] = b"amm_pool";
pub const LP_MINT_SEED: &[u8] = b"lp_mint";
pub const POOL_SOL_VAULT_SEED: &[u8] = b"pool_sol_vault";
pub const POOL_TOKEN_VAULT_SEED: &[u8] = b"pool_token_vault";
pub const FEE_NUMERATOR: u64 = 3;
pub const FEE_DENOMINATOR: u64 = 1000;

// ==================== PROGRAM ====================

#[program]
pub mod meme_launchpad {
    use super::*;

    // ==================== PROTOCOL MANAGEMENT ====================

    pub fn initialize_protocol_state(
        ctx: Context<InitializeProtocolState>,
        fee_lamports: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.protocol_state;
        state.authority = ctx.accounts.authority.key();
        state.fee_lamports = fee_lamports;
        state.bump = ctx.bumps.protocol_state;

        emit!(ProtocolInitialized {
            authority: ctx.accounts.authority.key(),
            fee_vault: ctx.accounts.fee_vault.key(),
            fee_lamports,
        });

        Ok(())
    }

    pub fn reset_protocol_state(ctx: Context<ResetProtocolState>) -> Result<()> {
        let state = &mut ctx.accounts.protocol_state;
        state.fee_lamports = 0;
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

        let pool_account_info = ctx.accounts.pool.to_account_info();
        let token_mint_key = ctx.accounts.token_mint.key();

        // Derive PDAs
        let (lp_mint_pda, _) =
            Pubkey::find_program_address(&[LP_MINT_SEED, token_mint_key.as_ref()], ctx.program_id);
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
        pool.lp_mint = lp_mint_pda;
        pool.sol_vault = sol_vault_pda;
        pool.token_vault = token_vault_pda;
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

        // Calculate and mint LP tokens
        let lp_amount = (initial_sol_amount as f64 * initial_token_amount as f64).sqrt() as u64;
        let pool_bump = ctx.bumps.pool;
        let pool_key = pool.key();
        pool.lp_supply = lp_amount;

        let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.initializer_lp_account.to_account_info(),
                    authority: pool_account_info,
                },
                &[&seeds[..]],
            ),
            lp_amount,
        )?;

        emit!(PoolInitialized {
            pool: pool_key,
            token_mint: token_mint_key,
            lp_mint: lp_mint_pda,
            initial_sol: initial_sol_amount,
            initial_tokens: initial_token_amount,
            lp_minted: lp_amount,
        });

        Ok(())
    }

    pub fn add_liquidity_to_pool(
        ctx: Context<AddLiquidity>,
        sol_amount: u64,
        max_token_amount: u64,
        min_lp_amount: u64,
    ) -> Result<()> {
        let pool_account_info = ctx.accounts.pool.to_account_info();
        let pool = &mut ctx.accounts.pool;

        require!(sol_amount > 0, AmmError::InvalidAmount);
        require!(pool.is_initialized, AmmError::PoolNotInitialized);

        // Calculate proportional token amount
        let token_amount = (sol_amount as u128)
            .checked_mul(pool.token_reserve as u128)
            .unwrap()
            .checked_div(pool.sol_reserve as u128)
            .unwrap() as u64;

        require!(token_amount <= max_token_amount, AmmError::SlippageExceeded);

        // Calculate LP tokens
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
            "Adding liquidity: {} SOL, {} tokens, {} LP",
            sol_amount,
            token_amount,
            lp_amount
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

        // Mint LP tokens
        let token_mint_key = pool.token_mint;
        let pool_bump = pool.bump;
        let pool_key = pool.key();
        let user_key = ctx.accounts.user.key();

        let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: ctx.accounts.user_lp_account.to_account_info(),
                    authority: pool_account_info,
                },
                &[&seeds[..]],
            ),
            lp_amount,
        )?;

        // Update reserves
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

    pub fn remove_liquidity_from_pool(
        ctx: Context<RemoveLiquidity>,
        lp_amount: u64,
        min_sol_amount: u64,
        min_token_amount: u64,
    ) -> Result<()> {
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
            "Removing liquidity: {} LP, {} SOL, {} tokens",
            lp_amount,
            sol_amount,
            token_amount
        );

        // Burn LP tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    from: ctx.accounts.user_lp_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            lp_amount,
        )?;

        let token_mint_key = pool.token_mint;
        let pool_bump = pool.bump;
        let pool_key = pool.key();
        let user_key = ctx.accounts.user.key();
        let seeds = &[AMM_POOL_SEED, token_mint_key.as_ref(), &[pool_bump]];

        // Transfer SOL back
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

        // Transfer tokens back
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

        // Transfer SOL from vault to user (manual lamport transfer)
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
    let minter_share = TOTAL_SUPPLY * 2 / 100;
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
pub struct ResetProtocolState<'info> {
    #[account(mut, seeds = [b"protocol_state_v2"], bump = protocol_state.bump, has_one = authority)]
    pub protocol_state: Account<'info, ProtocolState>,
    pub authority: Signer<'info>,
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
        init,
        payer = initializer,
        mint::decimals = 9,
        mint::authority = pool,
        seeds = [LP_MINT_SEED, token_mint.key().as_ref()],
        bump,
        mint::token_program = token_program
    )]
    pub lp_mint: InterfaceAccount<'info, Mint>,

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

    #[account(
        init_if_needed,
        payer = initializer,
        associated_token::mint = lp_mint,
        associated_token::authority = initializer,
        associated_token::token_program = token_program
    )]
    pub initializer_lp_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, AmmPool>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub lp_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()], bump)]
    pub sol_vault: SystemAccount<'info>,
    #[account(mut)]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_token_account.mint == pool.token_mint, constraint = user_token_account.owner == user.key())]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(init_if_needed, payer = user, associated_token::mint = lp_mint, associated_token::authority = user, associated_token::token_program = token_program)]
    pub user_lp_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [AMM_POOL_SEED, pool.token_mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, AmmPool>,
    pub token_mint: InterfaceAccount<'info, Mint>,
    #[account(mut)]
    pub lp_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, seeds = [POOL_SOL_VAULT_SEED, pool.token_mint.as_ref()], bump)]
    pub sol_vault: SystemAccount<'info>,
    #[account(mut)]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_token_account.mint == pool.token_mint, constraint = user_token_account.owner == user.key())]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_lp_account.mint == lp_mint.key(), constraint = user_lp_account.owner == user.key())]
    pub user_lp_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
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
    pub lp_mint: Pubkey,
    pub sol_vault: Pubkey,
    pub token_vault: Pubkey,
    pub sol_reserve: u64,
    pub token_reserve: u64,
    pub lp_supply: u64,
    pub bump: u8,
    pub is_initialized: bool,
}

impl AmmPool {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1;
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
}
