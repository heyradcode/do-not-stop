import { FightResult as FightResultEvent } from "../generated/Battle/Battle";
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
}
