//! Solana tabs program.
//!
//! Unidirectional tabs over SPL Token and Token-2022, built on
//! Pinocchio. Codama drives IDL + client generation.

#![no_std]

#[cfg(feature = "idl")]
extern crate alloc;

#[cfg(all(feature = "idl", target_os = "solana"))]
compile_error!("the `idl` feature is host-only; do not enable it for SBF builds");

use pinocchio::{AccountView, Address, ProgramResult, address::declare_id};

pinocchio::program_entrypoint!(process_instruction);
pinocchio::no_allocator!();
pinocchio::nostd_panic_handler!();

pub mod constants;
pub use constants::*;

pub mod errors;
pub use errors::*;

pub mod event_engine;
pub mod events;

pub mod instructions;
pub use instructions::helpers::ed25519;
pub use instructions::*;

pub mod state;
pub use state::*;

declare_id!("CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX");

fn process_instruction(
    program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    match TabsInstruction::from_bytes(instruction_data)? {
        TabsInstruction::Open(args) => open::process(program_id, accounts, &args),
        TabsInstruction::Settle => settle::process(program_id, accounts),
        TabsInstruction::TopUp(args) => top_up::process(program_id, accounts, args),
        TabsInstruction::SettleAndSeal(args) => {
            settle_and_seal::process(program_id, accounts, args)
        }
        TabsInstruction::RequestClose => request_close::process(program_id, accounts),
        TabsInstruction::Seal => seal::process(program_id, accounts),
        TabsInstruction::Distribute(args) => {
            distribute::process(program_id, accounts, &args)
        }
        TabsInstruction::WithdrawPayer => withdraw_payer::process(program_id, accounts),
        TabsInstruction::Reclaim => reclaim::process(program_id, accounts),
        TabsInstruction::EmitEvent => emit_event::process(program_id, accounts),
    }
}
