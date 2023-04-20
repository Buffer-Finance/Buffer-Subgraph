import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { _getWeekId } from "./helpers";
import { _loadOrCreateLBFRStat } from "./initialize";
import { Slabs } from "./config";

const FACTOR_OF_18 = BigInt.fromI64(1000000000000000000);
const FACTOR_OF_6 = BigInt.fromI64(1000000);
const ZERO = BigInt.fromI32(0);
const FACTOR_OF_2 = BigInt.fromI32(100);

function getLbfrAlloted(
  userVolume: BigInt,
): BigInt {
  let lbfrAlloted = ZERO;
  
  let newSlabIndex = ZERO;

  for (let i = 0; i < Slabs.length; i++) {
    let currentSlab = Slabs[i];
    // let currentMinVolume = currentSlab[0];
    if (userVolume > currentSlab[0].times(FACTOR_OF_18)) {
      newSlabIndex = i;
    }
    else {
      break;
    }
  }

  let newSlab = Slabs[newSlabIndex];
  // newSlab[0] = minRequiredVolume 
  // newSlab[1] = LBFR/usdcVolume rate 
  // newSlab[2] = equivalent lbfr before this slab
  // TODO: adjust the units, multipliers below
  return newSlab[2].times(FACTOR_OF_18).plus(
    userVolume.minus(newSlab[0].times(FACTOR_OF_18)).times(newSlab[1]).div(FACTOR_OF_2)
  );
}

export function updateLBFRStats(
  token: string,
  timestamp: BigInt,
  totalFee: BigInt,
  userAddress: Bytes
): void {
  let weekID = _getWeekId(timestamp);
  let LBFRStat = _loadOrCreateLBFRStat(
    "weekly",
    timestamp,
    userAddress,
    weekID
  );
  let TotalLBFRStat = _loadOrCreateLBFRStat(
    "total",
    timestamp,
    userAddress,
    "total"
  );

  if (token == "USDC") {
    totalFee = totalFee.times(FACTOR_OF_18).div(FACTOR_OF_6);
    LBFRStat.volumeUSDC = LBFRStat.volumeUSDC.plus(totalFee);
    TotalLBFRStat.volumeUSDC = TotalLBFRStat.volumeUSDC.plus(totalFee);
  } else if (token == "ARB") {
    totalFee = totalFee.times(FACTOR_OF_18).div(FACTOR_OF_18);
    LBFRStat.volumeARB = LBFRStat.volumeARB.plus(totalFee);
    TotalLBFRStat.volumeARB = TotalLBFRStat.volumeARB.plus(totalFee);
  }
  let initialVolume = LBFRStat.volume;
  let finalVolume = LBFRStat.volume.plus(totalFee);
  LBFRStat.volume = finalVolume;
  TotalLBFRStat.volume = TotalLBFRStat.volume.plus(totalFee);

  let lbfrAlloted = getLbfrAlloted(finalVolume).minus(getLbfrAlloted(initialVolume));
  LBFRStat.lBFRAlloted = LBFRStat.lBFRAlloted.plus(lbfrAlloted);
  TotalLBFRStat.lBFRAlloted = TotalLBFRStat.lBFRAlloted.plus(lbfrAlloted);

  LBFRStat.save();
  TotalLBFRStat.save();
}
