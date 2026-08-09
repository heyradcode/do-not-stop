import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  ItemCore,
  ItemEquipped,
  ItemUnequipped,
  TransferBatch,
  TransferSingle,
} from "../generated/ItemCore/ItemCore";
import { ItemBalance, PetEquipment } from "../generated/schema";
import { ITEMCORE_ADDRESS } from "./addresses";

/**
 * Inventory handlers (roadmap §4).
 *
 * Balances are projected from the ERC-1155 transfer events rather than from ItemCore's own
 * ItemsMinted/ItemsBurned. Those two are the readable narration of an acquisition; the
 * transfer events are the complete set. Minting, burning, escrowing gear, returning it, and
 * a plain wallet-to-wallet send all emit a transfer, and only some of them emit anything
 * else, so handling transfers is what makes the projection exhaustive instead of nearly so.
 */

const ZERO_ADDRESS = Address.zero();

/**
 * Re-reads one holder's balance of one item type and upserts it.
 *
 * A read rather than an accumulation, for the same reason `refreshPet` re-reads a pet: an
 * entity built by adding and subtracting deltas is only correct if every event that ever
 * moved the number was handled, and it drifts silently the first time one is missed. Reading
 * balanceOf makes each row a snapshot that a missed event can stale but not corrupt.
 */
function refreshBalance(owner: Address, itemType: BigInt, updatedAt: BigInt): void {
  // Mint and burn show up as transfers from and to the zero address. It holds no balance
  // and nothing reads it, so writing a row for it would be noise the indexer has to skip.
  if (owner.equals(ZERO_ADDRESS)) return;

  const core = ItemCore.bind(ITEMCORE_ADDRESS);
  const balance = core.try_balanceOf(owner, itemType);
  if (balance.reverted) return;

  const id = owner.toHexString() + "-" + itemType.toString();
  let entity = ItemBalance.load(id);
  if (entity == null) {
    entity = new ItemBalance(id);
  }

  entity.owner = owner;
  entity.itemType = itemType;
  entity.quantity = balance.value;
  entity.updatedAt = updatedAt;
  entity.save();
}

export function handleTransferSingle(event: TransferSingle): void {
  const updatedAt = event.block.timestamp;
  refreshBalance(event.params.from, event.params.id, updatedAt);
  refreshBalance(event.params.to, event.params.id, updatedAt);
}

export function handleTransferBatch(event: TransferBatch): void {
  const updatedAt = event.block.timestamp;
  const ids = event.params.ids;
  for (let i = 0; i < ids.length; i++) {
    refreshBalance(event.params.from, ids[i], updatedAt);
    refreshBalance(event.params.to, ids[i], updatedAt);
  }
}

export function handleItemEquipped(event: ItemEquipped): void {
  writeSlot(event.params.petId, event.params.slot, event.params.itemType, event.block.timestamp);
}

export function handleItemUnequipped(event: ItemUnequipped): void {
  // Zero, not a delete. The indexer resumes from `updatedAt`, so an entity that stops
  // existing is an entity it never learns about, and it would keep the pet geared forever.
  writeSlot(event.params.petId, event.params.slot, BigInt.zero(), event.block.timestamp);
}

/**
 * Upserts one pet's slot.
 *
 * No owner field, deliberately. The owner is on the Pet entity and changes when the pet is
 * transferred, which ItemCore emits nothing for: a copy stored here would be right until the
 * first time a geared pet changed hands and wrong silently after that.
 */
function writeSlot(petId: BigInt, slot: i32, itemType: BigInt, updatedAt: BigInt): void {
  const id = petId.toString() + "-" + slot.toString();
  let entity = PetEquipment.load(id);
  if (entity == null) {
    entity = new PetEquipment(id);
  }

  entity.petId = petId;
  entity.slot = slot;
  entity.itemType = itemType;
  entity.updatedAt = updatedAt;
  entity.save();
}
