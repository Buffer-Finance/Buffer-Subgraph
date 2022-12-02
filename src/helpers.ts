import { BigInt } from "@graphprotocol/graph-ts"
export let BASIS_POINTS_DIVISOR = BigInt.fromI32(10000)
export let PRECISION = BigInt.fromI32(10).pow(30)

export function timestampToDay(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(86400)) 
}

export function timestampToPeriod(timestamp: BigInt, period: string): BigInt {
  let periodTime: BigInt

  if (period == "daily") {
    periodTime = BigInt.fromI32(86400)
  } else if (period == "hourly") {
    periodTime = BigInt.fromI32(3600)
  } else if (period == "weekly" ){
    periodTime = BigInt.fromI32(86400 * 7)
  } else {
    throw new Error("Unsupported period " + period)
  }
  let return_value = timestamp.div(periodTime)

  return return_value
}

