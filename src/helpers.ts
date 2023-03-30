import { BigInt } from "@graphprotocol/graph-ts";

export function _getDayId(timestamp: BigInt): string {
  let dayTimestamp = (timestamp.toI32() - 16 * 3600) / 86400;
  return dayTimestamp.toString();
}

export function _getWeekId(timestamp: BigInt): string {
  let weekTimestamp = (timestamp.toI32() - 4 * 86400 - 16 * 3600) / (86400 * 7);
  return weekTimestamp.toString();
}

export function _getHourId(timestamp: BigInt): string {
  let hourTimestamp = (timestamp.toI32() - 16 * 3600) / 3600;
  return hourTimestamp.toString();
}
