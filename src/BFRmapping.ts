import { BigInt } from "@graphprotocol/graph-ts";
import {Transfer } from "../generated/ERC20/ERC20";
import {
  BFRHolder,
  BFRHolderData
} from "../generated/schema";
import { _getDayId } from "./helpers";
let ZERO = BigInt.fromI32(0);
const zeroAddress = '0x0000000000000000000000000000000000000000';

function loadOrCreateBFRHolder(address: string, timestamp: BigInt): BFRHolder {
  let bfrHolderData = loadOrCreateBFRHolderData(timestamp, "total", "total");
  let account = BFRHolder.load(address);
  if (!account) {
    account = new BFRHolder(address);
    bfrHolderData.holders += 1;
    account.balance = ZERO;
    account.save();
    bfrHolderData.save()
  }
  let dayID = _getDayId(timestamp);
  let referenceID = dayID;
  let dailyBfrHolderData = loadOrCreateBFRHolderData(timestamp, "daily", referenceID);
  dailyBfrHolderData.holders = bfrHolderData.holders;
  dailyBfrHolderData.save()
  return account;
}

function loadOrCreateBFRHolderData(timestamp: BigInt, period: string, id: string): BFRHolderData {
  let entity = BFRHolderData.load(id);
  if (!entity) {
    entity = new BFRHolderData(id);
    entity.holders = 0;
    entity.period = period;
    entity.timestamp = timestamp;
    entity.save();
  }
  return entity;
}

export function handleTransfer(event: Transfer): void {
  let from = event.params.from.toHex();
  let to = event.params.to.toHex();
  let value = event.params.value;
  let timestamp = event.block.timestamp;
  let fromAccount = loadOrCreateBFRHolder(from, timestamp);
  let toAccount = loadOrCreateBFRHolder(to, timestamp);
  if (fromAccount.id != zeroAddress) {
    fromAccount.balance = fromAccount.balance.minus(value);
    fromAccount.save();
    fromAccount = loadOrCreateBFRHolder(from, timestamp);
  }
  toAccount.balance = toAccount.balance.plus(value);
  toAccount.save();
}