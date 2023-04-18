import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { _getWeekId } from "./helpers";
import { _loadOrCreateLBFRStat } from "./initialize";
import { Slabs } from "./config";

export function updateOpeningStats(
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
  LBFRStat.volume = LBFRStat.volume.plus(totalFee);
  TotalLBFRStat.volume = TotalLBFRStat.volume.plus(totalFee);

  let lbfrPerUnitVolume = 0;
  for (let i = 0; i < Slabs.length; i++) {
    const slab = Slabs[i];
    if (LBFRStat.volume > BigInt.fromI32(slab[0])) {
      lbfrPerUnitVolume = slab[1];
    }
  }

  let lbfrAlloted = totalFee
    .times(BigInt.fromI32(lbfrPerUnitVolume))
    .div(BigInt.fromI32(100));
  LBFRStat.lBFRAlloted = LBFRStat.lBFRAlloted.plus(lbfrAlloted);
  TotalLBFRStat.lBFRAlloted = TotalLBFRStat.lBFRAlloted.plus(lbfrAlloted);

  if (token == "USDC") {
    LBFRStat.volumeUSDC = LBFRStat.volumeUSDC.plus(totalFee);
    TotalLBFRStat.volumeUSDC = TotalLBFRStat.volumeUSDC.plus(totalFee);
  } else if (token == "ARB") {
    LBFRStat.volumeARB = LBFRStat.volumeARB.plus(totalFee);
    TotalLBFRStat.volumeARB = TotalLBFRStat.volumeARB.plus(totalFee);
  }
  LBFRStat.save();
  TotalLBFRStat.save();
}

