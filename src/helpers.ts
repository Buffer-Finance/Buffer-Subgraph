import { BigInt } from "@graphprotocol/graph-ts";

export function _getDayId(timestamp: BigInt): string {
  let dayTimestamp = timestamp.toI32() / 86400;
  return dayTimestamp.toString();
}

export function _getHourId(timestamp: BigInt): string {
  let hourTimestamp = timestamp.toI32() / 3600;
  return hourTimestamp.toString();
}
