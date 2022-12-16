import { BigInt } from "@graphprotocol/graph-ts"

export function timestampToDay(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(86400)) 
}


export function _getDayId(timestamp: BigInt): string {
  let dayTimestamp = timestamp.toI32() / 86400 
  return dayTimestamp.toString()
}