use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{initialize_mint2, mint_to, InitializeMint2, MintTo, Token2022};
use anchor_spl::token_interface::{Mint, TokenAccount};

declare_id!("2hjgw8cWi4Dbb9BLygZhopEzVAFPQndiD6Z9UjJsdUJE");

#[program]
pub mod meme_launchpad {
    use super::*;

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

    /// Mint a new meme token (PDA-based mint)
    pub fn mint_meme_token(ctx: Context<MintMemeToken>, meme_id: [u8; 32]) -> Result<()> {
        let protocol_state = &ctx.accounts.protocol_state;

        // Ensure not already initialized
        require!(
            !ctx.accounts.meme_token_state.is_initialized,
            ErrorCode::MemeAlreadyMinted
        );

        // === Step 1: Transfer protocol fee (SOL) ===
        transfer_native_sol_fee(&ctx.accounts, protocol_state.fee_lamports)?;

        // // === Step 2: Initialize mint with vault PDA as authority ===
        // initialize_meme_mint(&ctx)?;

        // === Step 3: Distribute supply (2% minter, 98% vault) ===
        distribute_supply(&ctx)?;

        // === Step 4: Update MemeTokenState ===
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
}

// --------------------- HELPERS ---------------------

fn transfer_native_sol_fee(accounts: &MintMemeToken, fee_lamports: u64) -> Result<()> {
    let cpi_ctx = CpiContext::new(
        accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: accounts.minter.to_account_info(),
            to: accounts.fee_vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, fee_lamports)
}

// fn initialize_meme_mint(ctx: &Context<MintMemeToken>) -> Result<()> {
//     const DECIMALS: u8 = 9;

//     let mint_key = ctx.accounts.mint.key();
//     let vault_seeds_bytes: &[&[u8]] = &[b"vault", mint_key.as_ref(), &[ctx.bumps.vault]];

//     // Bind the outer slice as a variable too
//     let signer_seeds: &[&[&[u8]]] = &[vault_seeds_bytes];

//     let cpi_ctx = CpiContext::new_with_signer(
//         ctx.accounts.token_program.to_account_info(),
//         InitializeMint2 {
//             mint: ctx.accounts.mint.to_account_info(),
//         },
//         signer_seeds,
//     );

//     initialize_mint2(
//         cpi_ctx,
//         DECIMALS,
//         &ctx.accounts.vault.key(),
//         Some(&ctx.accounts.vault.key()),
//     )
// }

fn distribute_supply(ctx: &Context<MintMemeToken>) -> Result<()> {
    const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000_000;
    let minter_share = TOTAL_SUPPLY * 2 / 100;
    let vault_share = TOTAL_SUPPLY - minter_share;

    let mint_key = ctx.accounts.mint.key();
    let vault_seeds_bytes: &[&[u8]] = &[b"vault", mint_key.as_ref(), &[ctx.bumps.vault]];
    let signer_seeds: &[&[&[u8]]] = &[vault_seeds_bytes];

    // Mint 2% to minter
    mint_to(
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

    // Mint 98% to vault
    mint_to(
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

// --------------------- ACCOUNTS ---------------------

#[derive(Accounts)]
pub struct InitializeProtocolState<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 128,
        seeds = [b"protocol_state_v2"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"fee_vault"],
        bump
    )]
    pub fee_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetProtocolState<'info> {
    #[account(
        mut,
        seeds = [b"protocol_state_v2"],
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
        space = 8 + 32 + 32 + 32 + 8 + 1 + 1,
        seeds = [b"meme_token_state", meme_id.as_ref()],
        bump
    )]
    pub meme_token_state: Account<'info, MemeTokenState>,

    // ✅ Initialize the mint PDA
    #[account(
        init,
        payer = minter,
        mint::decimals = 9,
        mint::authority = vault,
        mint::freeze_authority = vault,
        seeds = [b"meme_mint", meme_id.as_ref()],
        bump,
        mint::token_program = token_program
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = minter,
        associated_token::token_program = token_program
    )]
    pub minter_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"fee_vault"],
        bump
    )]
    pub fee_vault: UncheckedAccount<'info>,

    #[account(
        seeds = [b"protocol_state_v2"],
        bump = protocol_state.bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
// --------------------- STATE ---------------------

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

// --------------------- EVENTS ---------------------

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

// --------------------- ERRORS ---------------------

#[error_code]
pub enum ErrorCode {
    #[msg("Meme already minted")]
    MemeAlreadyMinted,
}
