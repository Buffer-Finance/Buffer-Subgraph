import { Address, BigInt } from "@graphprotocol/graph-ts";
import {Transfer } from "../generated/ERC20/ERC20";
import {
  Holder
} from "../generated/schema";
let ZERO = BigInt.fromI32(0);
const zeroAddress = '0x0000000000000000000000000000000000000000';


function loadOrCreateHolderData(account: Address): Holder {
  let entity = Holder.load(account);
  if (!entity) {
    entity = new Holder(account);
    entity.balance = ZERO;
    entity.save();
  }
  return entity;
}

export function handleTransfer(event: Transfer): void {
  let fromAccount = loadOrCreateHolderData(event.params.from);
  let toAccount = loadOrCreateHolderData(event.params.to);
  if (fromAccount.id != Address.fromString(zeroAddress)) {
    fromAccount.balance = fromAccount.balance.minus(event.params.value);
    fromAccount.save();
  }
  if (toAccount.id != Address.fromString(zeroAddress)) {
    toAccount.balance = toAccount.balance.plus(event.params.value);
    toAccount.save();
  }
}
