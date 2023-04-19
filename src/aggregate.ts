import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { _getWeekId } from "./helpers";
import { _loadOrCreateLBFRStat, _loadOrCreateLBFRAllotmentDataPerUser } from "./initialize";
import { Slabs } from "./config";

function _getLBFRAlloted(
  userCumulativeWeekVolume: BigInt,
  totalFee: BigInt
): BigInt {
  let lbfrPerUnitVolume = 0;
  for (let i = 0; i < Slabs.length; i++) {
    const slab = Slabs[i];
    if (
      userCumulativeWeekVolume.div(BigInt.fromI64(1000000000000000000)) >
      BigInt.fromI32(slab[0])
    ) {
      lbfrPerUnitVolume = slab[1];
    }
  }
  let lbfrAlloted = totalFee
    .times(BigInt.fromI32(lbfrPerUnitVolume))
    .div(BigInt.fromI32(100));
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
  let LBFRAllotmentData = _loadOrCreateLBFRAllotmentDataPerUser(
    userAddress,
    timestamp
  );
  if (token == "USDC") {
    totalFee = totalFee
      .times(BigInt.fromI64(1000000000000000000))
      .div(BigInt.fromI64(1000000));
    LBFRStat.volumeUSDC = LBFRStat.volumeUSDC.plus(totalFee);
    TotalLBFRStat.volumeUSDC = TotalLBFRStat.volumeUSDC.plus(totalFee);
  } else if (token == "ARB") {
    totalFee = totalFee
      .times(BigInt.fromI64(1000000000000000000))
      .div(BigInt.fromI64(1000000000000000000));
    LBFRStat.volumeARB = LBFRStat.volumeARB.plus(totalFee);
    TotalLBFRStat.volumeARB = TotalLBFRStat.volumeARB.plus(totalFee);
  }
  LBFRStat.volume = LBFRStat.volume.plus(totalFee);
  TotalLBFRStat.volume = TotalLBFRStat.volume.plus(totalFee);
  let lbfrAlloted = _getLBFRAlloted(LBFRStat.volume, totalFee);
  LBFRStat.lBFRAlloted = LBFRStat.lBFRAlloted.plus(lbfrAlloted);
  TotalLBFRStat.lBFRAlloted = TotalLBFRStat.lBFRAlloted.plus(lbfrAlloted);

  LBFRAllotmentData.totalAllottedTokens = LBFRAllotmentData.totalAllottedTokens.plus(lbfrAlloted)
  LBFRAllotmentData.totalVolume = LBFRAllotmentData.totalVolume.plus(totalFee)
  LBFRAllotmentData.timestamp = timestamp;

  LBFRStat.save();
  TotalLBFRStat.save();
  LBFRAllotmentData.save();
}
