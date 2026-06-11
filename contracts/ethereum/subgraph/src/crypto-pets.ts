import {
  Transfer as TransferEvent,
  BreedFulfilled as BreedFulfilledEvent,
} from "../generated/CryptoPets/CryptoPets";
import { CRYPTOPETS_ADDRESS } from "./addresses";
import { refreshPetFromChain } from "./pet";

export function handleTransfer(event: TransferEvent): void {
  refreshPetFromChain(
    event.params.tokenId,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );
}

export function handleBreedFulfilled(event: BreedFulfilledEvent): void {
  refreshPetFromChain(
    event.params.childId,
    CRYPTOPETS_ADDRESS,
    event.block.timestamp
  );
}
