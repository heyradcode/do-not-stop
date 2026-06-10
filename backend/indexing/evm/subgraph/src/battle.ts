import { FightResult as FightResultEvent } from "../generated/Battle/Battle";
import { Battle } from "../generated/schema";
import { CRYPTOPETS_ADDRESS } from "./addresses";
import { refreshPetFromChain } from "./pet";

export function handleFightResult(event: FightResultEvent): void {
  refreshPetFromChain(
    event.params.petId1,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );
  refreshPetFromChain(
    event.params.petId2,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );

  // Record the settle itself. Immutable: one event, one row, written once.
  const id =
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const battle = new Battle(id);
  battle.attacker = event.params.petId1.toString();
  battle.defender = event.params.petId2.toString();
  battle.winnerPetId = event.params.firstWins
    ? event.params.petId1.toString()
    : event.params.petId2.toString();
  battle.foughtAt = event.block.timestamp;
  battle.save();
}
