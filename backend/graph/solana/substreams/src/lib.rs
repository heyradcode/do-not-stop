mod pb;

use pb::cryptopets::v1::{Pet, Pets};
use pb::sf::substreams::solana::r#type::v1::FilteredAccounts;
use substreams::errors::Error;
use substreams::Hex;
use substreams_entity_change::pb::entity::EntityChanges;
use substreams_entity_change::tables::Tables;

/// Anchor discriminator for `PetAccount` — sha256("account:PetAccount")[..8].
const PET_ACCOUNT_DISCRIMINATOR: [u8; 8] = [223, 222, 129, 89, 70, 231, 141, 184];

/// Byte length of a serialized `PetAccount` — Anchor `PetAccount::SPACE`
/// (8-byte discriminator + Borsh-packed fields). Must stay in sync with
/// `contracts/solana/cryptopets/programs/cryptopets/src/state.rs`.
const PET_ACCOUNT_LEN: usize = 101;

/// Decode every `PetAccount` owned by the program (filtered upstream by the
/// `accounts:filtered_accounts` module via the `owner:` param).
#[substreams::handlers::map]
fn map_pets(accounts: FilteredAccounts) -> Result<Pets, Error> {
    let pets = accounts
        .accounts
        .iter()
        .filter(|a| a.data.len() == PET_ACCOUNT_LEN && a.data[..8] == PET_ACCOUNT_DISCRIMINATOR)
        .filter_map(|a| decode_pet_account(&a.data, a.source_slot))
        .collect();

    Ok(Pets { pets })
}

/// Emit one `Pet` entity row per account for the subgraph sink.
#[substreams::handlers::map]
fn graph_out(pets: Pets) -> Result<EntityChanges, Error> {
    let mut tables = Tables::new();

    for pet in pets.pets {
        tables
            .update_row("Pet", &pet.id)
            .set("owner", &format!("0x{}", Hex(&pet.owner)))
            .set("name", &pet.name)
            .set("dna", &pet.dna)
            .set("level", pet.level)
            .set("rarity", pet.rarity)
            .set("winCount", pet.win_count)
            .set("lossCount", pet.loss_count)
            .set("readyAt", &pet.ready_at)
            .set("updatedAt", &pet.updated_at);
    }

    Ok(tables.to_entity_changes())
}

/// Borsh layout after the 8-byte discriminator, in `PetAccount` declaration
/// order (state.rs): id u32 | owner [u8;32] | dna u64 | rarity u8 |
/// level u16 | ready_time i64 | win_count u16 | loss_count u16 | bump u8 |
/// name [u8;32] | name_len u8.
fn decode_pet_account(data: &[u8], updated_slot: u64) -> Option<Pet> {
    let body = data.get(8..)?;

    let id = u32::from_le_bytes(body.get(0..4)?.try_into().ok()?);
    let owner = body.get(4..36)?.to_vec();
    let dna = u64::from_le_bytes(body.get(36..44)?.try_into().ok()?);
    let rarity = *body.get(44)?;
    let level = u16::from_le_bytes(body.get(45..47)?.try_into().ok()?);
    let ready_time = i64::from_le_bytes(body.get(47..55)?.try_into().ok()?);
    let win_count = u16::from_le_bytes(body.get(55..57)?.try_into().ok()?);
    let loss_count = u16::from_le_bytes(body.get(57..59)?.try_into().ok()?);
    // body[59] = bump (not indexed)
    let name_bytes = body.get(60..92)?;
    let name_len = (*body.get(92)? as usize).min(name_bytes.len());
    let name = String::from_utf8_lossy(&name_bytes[..name_len]).into_owned();

    Some(Pet {
        id: id.to_string(),
        owner,
        name,
        dna: dna.to_string(),
        level: level as u32,
        rarity: rarity as u32,
        win_count: win_count as u32,
        loss_count: loss_count as u32,
        ready_at: ready_time.to_string(),
        updated_at: updated_slot.to_string(),
    })
}
