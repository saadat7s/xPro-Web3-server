use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{initialize_mint2, mint_to, InitializeMint2, MintTo, Token2022};
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TransferChecked};

declare_id!("Acz1HE7FeaNhTrtXBYxmhZtMQ974UFqqJEda3PmWQNLV");

#[program]
pub mod meme_launchpad {
    use super::*;

    /// Initialize protocol with fee configuration
    pub fn initialize_protocol_state(
        ctx: Context<InitializeProtocolState>,
        fee_lamports: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.protocol_state;
        state.authority = ctx.accounts.authority.key();
        state.fee_vault = ctx.accounts.fee_vault.key();
        state.fee_lamports = fee_lamports;
        state.bump = ctx.bumps.protocol_state;

        emit!(ProtocolInitialized {
            authority: ctx.accounts.authority.key(),
            fee_vault: ctx.accounts.fee_vault.key(),
            fee_lamports,
        });

        Ok(())
    }

    /// Reset protocol state (admin only)
    pub fn reset_protocol_state(ctx: Context<ResetProtocolState>) -> Result<()> {
        let state = &mut ctx.accounts.protocol_state;
        state.fee_lamports = 0;
        Ok(())
    }

    /// Mint a new meme token (enforces uniqueness per meme_id)
    pub fn mint_meme_token(
        ctx: Context<MintMemeToken>,
        meme_id: [u8; 32],
        name: String,
        symbol: String,
        _uri: String,
    ) -> Result<()> {
        let protocol_state = &ctx.accounts.protocol_state;

        // Ensure not already initialized
        require!(
            !ctx.accounts.meme_token_state.is_initialized,
            ErrorCode::MemeAlreadyMinted
        );

        // Transfer protocol fee from minter to vault
        transfer_protocol_fee(&ctx.accounts, protocol_state.fee_lamports)?;

        // Initialize the new token mint
        initialize_meme_mint(&ctx.accounts)?;

        // Distribute token supply (50/50 split)
        distribute_supply(&ctx.accounts)?;

        // Update state
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
            name,
            symbol,
        });

        Ok(())
    }
}

/// Transfer protocol fee to vault
fn transfer_protocol_fee(accounts: &MintMemeToken, fee: u64) -> Result<()> {
    const SOL_DECIMALS: u8 = 9;

    let cpi_accounts = TransferChecked {
        from: accounts.minter_sol_account.to_account_info(),
        mint: accounts.sol_mint.to_account_info(),
        to: accounts.protocol_fee_vault.to_account_info(),
        authority: accounts.minter.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(accounts.token_program.to_account_info(), cpi_accounts);
    transfer_checked(cpi_ctx, fee, SOL_DECIMALS)?;
    Ok(())
}

/// Initialize new meme token mint
fn initialize_meme_mint(accounts: &MintMemeToken) -> Result<()> {
    const DECIMALS: u8 = 9;

    let init_accounts = InitializeMint2 {
        mint: accounts.mint.to_account_info(),
    };
    let init_ctx = CpiContext::new(accounts.token_program.to_account_info(), init_accounts);
    initialize_mint2(
        init_ctx,
        DECIMALS,
        &accounts.minter.key(),       // mint authority
        Some(&accounts.minter.key()), // freeze authority
    )?;
    Ok(())
}

/// Distribute supply between minter and vault (50/50)
fn distribute_supply(accounts: &MintMemeToken) -> Result<()> {
    const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000; // 1B tokens with 9 decimals
    const MINTER_SHARE: u64 = TOTAL_SUPPLY / 100 * 2; // 2%
    const VAULT_SHARE: u64 = TOTAL_SUPPLY / 100 * 98; // 98%

    // Mint 2% to minter
    let mint_to_minter = MintTo {
        mint: accounts.mint.to_account_info(),
        to: accounts.minter_token_account.to_account_info(),
        authority: accounts.minter.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(accounts.token_program.to_account_info(), mint_to_minter);
    mint_to(cpi_ctx, MINTER_SHARE)?;

    // Mint 98% to vault
    let mint_to_vault = MintTo {
        mint: accounts.mint.to_account_info(),
        to: accounts.vault_token_account.to_account_info(),
        authority: accounts.minter.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(accounts.token_program.to_account_info(), mint_to_vault);
    mint_to(cpi_ctx, VAULT_SHARE)?;

    Ok(())
}

// Account Structs

#[derive(Accounts)]
pub struct InitializeProtocolState<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 1, // discriminator + authority + fee_vault + fee_lamports + bump
        seeds = [b"protocol_state"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Token account controlled by protocol
    pub fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetProtocolState<'info> {
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump = protocol_state.bump,
        has_one = authority
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(meme_id: [u8; 32])]
pub struct MintMemeToken<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        init,
        payer = minter,
        space = 8 + 32 + 32 + 32 + 8 + 1 + 1, // discriminator + meme_id + mint + minter + created_at + is_initialized + bump
        seeds = [b"meme_token_state", meme_id.as_ref()],
        bump
    )]
    pub meme_token_state: Account<'info, MemeTokenState>,

    #[account(init, payer = minter, space = 82)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = minter,
        associated_token::token_program = token_program
    )]
    pub minter_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub minter_sol_account: InterfaceAccount<'info, TokenAccount>,

    pub sol_mint: InterfaceAccount<'info, Mint>,

    #[account(mut, address = protocol_state.fee_vault)]
    pub protocol_fee_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"protocol_state"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// State Accounts

#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub fee_vault: Pubkey,
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

// Events

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
    pub name: String,
    pub symbol: String,
}

// Errors

#[error_code]
pub enum ErrorCode {
    #[msg("Meme already minted")]
    MemeAlreadyMinted,
}
