import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { _getWeekId } from "./helpers";
import { _loadOrCreateLBFRStat } from "./initialize";
import { Slabs } from "./config";

const FACTOR_OF_18 = BigInt.fromI64(1000000000000000000);
const FACTOR_OF_6 = BigInt.fromI64(1000000);
const ZERO = BigInt.fromI32(0);
const FACTOR_OF_2 = BigInt.fromI32(100);

function getLbfrAlloted(
  initialVolume: BigInt,
  finalVolume: BigInt,
  totalFee: BigInt
): BigInt {
  let lbfrAlloted = ZERO;
  let formerLbfrPerUnitVolume = ZERO;
  let latterLbfrPerUnitVolume = ZERO;
  let latterSlabVolume = ZERO;

  for (let i = 0; i < Slabs.length; i++) {
    let slab = Slabs[i];
    let minVolume = slab[0];
    let factor = slab[1];

    if (initialVolume > minVolume.times(FACTOR_OF_18)) {
      formerLbfrPerUnitVolume = factor;
    }

    if (finalVolume > minVolume.times(FACTOR_OF_18)) {
      latterSlabVolume = minVolume;
      latterLbfrPerUnitVolume = factor;
    }
  }

  if (formerLbfrPerUnitVolume == latterLbfrPerUnitVolume) {
    lbfrAlloted = totalFee.times(latterLbfrPerUnitVolume).div(FACTOR_OF_2);
  } else {
    let lbfrAllotedForFormerSlab = latterSlabVolume
      .minus(initialVolume)
      .times(formerLbfrPerUnitVolume);
    let lbfrAllotedForLatterSlab = finalVolume
      .minus(latterSlabVolume.minus(initialVolume))
      .times(latterLbfrPerUnitVolume);
    lbfrAlloted = lbfrAllotedForFormerSlab.plus(lbfrAllotedForLatterSlab).div(FACTOR_OF_2);
  }

  return lbfrAlloted;
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

  let lbfrAlloted = getLbfrAlloted(initialVolume, finalVolume, totalFee);

  LBFRStat.lBFRAlloted = LBFRStat.lBFRAlloted.plus(lbfrAlloted);
  TotalLBFRStat.lBFRAlloted = TotalLBFRStat.lBFRAlloted.plus(lbfrAlloted);

  LBFRStat.save();
  TotalLBFRStat.save();
}
