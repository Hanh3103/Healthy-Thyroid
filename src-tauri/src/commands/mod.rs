//! Feature command modules, registered in `lib.rs`.
//!
//! Each top-level tab owns its commands. `storage.rs` is the only shared
//! helper; the feature files define the public `load_*` / `save_*` commands.

pub mod diet;
pub mod profile;
pub mod storage;
pub mod tasks;
pub mod thyroid;
