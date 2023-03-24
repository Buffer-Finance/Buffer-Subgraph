import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { BinaryPool } from "../generated/BinaryPool/BinaryPool";
import { User, VolumePerContract } from "../generated/schema";
import { _getDayId, _getHourId, _checkIfUserInArray, _getWeekId } from "./helpers";
import {
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
  _loadOrCreateQueuedOptionEntity,
  _loadOrCreateVolumeStat,
  _loadOrCreateARBVolumeStat,
  _loadOrCreateTradingStatEntity,
  _loadOrCreateAssetTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateDashboardStat,
  _loadOrCreateDailyRevenueAndFee,
  _loadOrCreateWeeklyRevenueAndFee,
  _loadOrCreateUserRewards,
  _loadOrCreateARBFeeStat
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import {
  DailyUserStat
} from "../generated/schema";
import { State, RouterAddress, USDC_ADDRESS, ARB_TOKEN_ADDRESS } from "./config";

function _logVolumeAndSettlementFeePerContract(
  id: string,
  period: string,
  timestamp: BigInt,
  contractAddress: Bytes,
  depositToken: string,
  totalFee: BigInt,
  settlementFee: BigInt
): void {
  let referrenceID = `${id}${contractAddress}${depositToken}`;
  let entity = VolumePerContract.load(referrenceID);
  if (entity === null) {
    entity = new VolumePerContract(referrenceID);
    entity.period = period;
    entity.timestamp = timestamp;
    entity.amount = totalFee;
    entity.optionContract = contractAddress;
    entity.depositToken = depositToken;
    entity.settlementFee = settlementFee;
    entity.save();
  } else {
    entity.amount = entity.amount.plus(totalFee);
    entity.settlementFee = entity.settlementFee.plus(settlementFee);
    entity.save();
  }
}

function _logVolume(timestamp: BigInt, amount: BigInt): void {
  let totalEntity = _loadOrCreateVolumeStat("total", "total", timestamp);
  totalEntity.amount = totalEntity.amount.plus(amount);
  totalEntity.save();

  let id = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateVolumeStat(id, "daily", timestamp);
  dailyEntity.amount = dailyEntity.amount.plus(amount);
  dailyEntity.save();

  let hourID = _getHourId(timestamp);
  let hourlyEntity = _loadOrCreateVolumeStat(hourID, "hourly", timestamp);
  hourlyEntity.amount = hourlyEntity.amount.plus(amount);
  hourlyEntity.save();
}

function _logARBVolume(timestamp: BigInt, amount: BigInt): void {
  let totalEntity = _loadOrCreateARBVolumeStat("total", "total", timestamp);
  totalEntity.amount = totalEntity.amount.plus(amount);
  totalEntity.save();

  let id = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateARBVolumeStat(id, "daily", timestamp);
  dailyEntity.amount = dailyEntity.amount.plus(amount);
  dailyEntity.save();

  let hourID = _getHourId(timestamp);
  let hourlyEntity = _loadOrCreateARBVolumeStat(hourID, "hourly", timestamp);
  hourlyEntity.amount = hourlyEntity.amount.plus(amount);
  hourlyEntity.save();
}


function _storeFees(timestamp: BigInt, fees: BigInt): void {
  let id = _getDayId(timestamp);
  let entity = _loadOrCreateFeeStat(id, "daily", timestamp);
  entity.fee = entity.fee.plus(fees);
  entity.save();

  let totalEntity = _loadOrCreateFeeStat("total", "total", timestamp);
  totalEntity.fee = totalEntity.fee.plus(fees);
  totalEntity.save();
}

function _storeARBFees(timestamp: BigInt, fees: BigInt): void {
  let id = _getDayId(timestamp);
  let entity = _loadOrCreateARBFeeStat(id, "daily", timestamp);
  entity.fee = entity.fee.plus(fees);
  entity.save();

  let totalEntity = _loadOrCreateARBFeeStat("total", "total", timestamp);
  totalEntity.fee = totalEntity.fee.plus(fees);
  totalEntity.save();
}

export function logUser(timestamp: BigInt, account: Address): void {
  let user = User.load(account);
  let id =   _getDayId(timestamp);
  let dailyUserStatid =  `${id}-${account.toString()}`;
  let userStat = _loadOrCreateUserStat(id, "daily", timestamp);
  if (user == null) {
    let totalUserStat = _loadOrCreateUserStat("total", "total", timestamp);
    totalUserStat.uniqueCountCumulative =
      totalUserStat.uniqueCountCumulative + 1;
    totalUserStat.save();

    userStat.uniqueCount = userStat.uniqueCount + 1;
    userStat.existingCount += 1;
    userStat.users = userStat.users.concat([account]);
    userStat.save();

    user = new User(account);
    user.address = account;
    user.save();

    let dailyUserStat = new DailyUserStat(dailyUserStatid);
    dailyUserStat.save();
  } else {
      let entity = DailyUserStat.load(dailyUserStatid);
      if (entity == null) {
        userStat.existingCount += 1;
        userStat.save();
        entity = new DailyUserStat(dailyUserStatid);
        entity.save();
    }
  }
}

export function storePnl(
  timestamp: BigInt,
  pnl: BigInt,
  isProfit: boolean
): void {
  let totalEntity = _loadOrCreateTradingStatEntity("total", "total", timestamp);
  let dayID = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateTradingStatEntity(dayID, "daily", timestamp);

  if (isProfit) {
    totalEntity.profitCumulative = totalEntity.profitCumulative.plus(pnl);
    dailyEntity.profit = dailyEntity.profit.plus(pnl);
  } else {
    totalEntity.lossCumulative = totalEntity.lossCumulative.plus(pnl);
    dailyEntity.loss = dailyEntity.loss.plus(pnl);
  }
  totalEntity.save();
  let totalEntityV2 = _loadOrCreateTradingStatEntity("total", "total", timestamp);
  dailyEntity.profitCumulative = totalEntityV2.profitCumulative;
  dailyEntity.lossCumulative = totalEntityV2.lossCumulative;
  dailyEntity.save();
}

export function storePnlPerContract(
  timestamp: BigInt,
  pnl: BigInt,
  isProfit: boolean,
  contractAddress: Bytes
): void {
  let totalID = `total-${contractAddress}`;
  let totalEntity = _loadOrCreateAssetTradingStatEntity(totalID, "total", timestamp, contractAddress, "total");
  let dayID = _getDayId(timestamp);
  let id = `${dayID}-${contractAddress}`;
  let dailyEntity = _loadOrCreateAssetTradingStatEntity(id, "daily", timestamp, contractAddress, dayID);

  if (isProfit) {
    totalEntity.profitCumulative = totalEntity.profitCumulative.plus(pnl);
    dailyEntity.profit = dailyEntity.profit.plus(pnl);
  } else {
    totalEntity.lossCumulative = totalEntity.lossCumulative.plus(pnl);
    dailyEntity.loss = dailyEntity.loss.plus(pnl);
  }
  totalEntity.save();
  let totalEntityV2 = _loadOrCreateAssetTradingStatEntity(totalID, "total", timestamp, contractAddress, "total");
  dailyEntity.profitCumulative = totalEntityV2.profitCumulative;
  dailyEntity.lossCumulative = totalEntityV2.lossCumulative;
  dailyEntity.save();
}


export function updateOptionContractData(
  isAbove: boolean,
  totalFee: BigInt,
  contractAddress: Address
): string {
  let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
  let optionContractData = _loadOrCreateOptionContractEntity(contractAddress);
  let tokenReferrenceID = "USDC";
  if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
    tokenReferrenceID = "USDC";
    updateOpenInterestPerContract(
      true,
      isAbove,
      totalFee,
      contractAddress
    );
  } else if (optionContractInstance.tokenX() == Address.fromString(ARB_TOKEN_ADDRESS)) {
    tokenReferrenceID = "ARB";
  }
  optionContractData.token = tokenReferrenceID;
  optionContractData.tradeCount += 1;
  optionContractData.volume = optionContractData.volume.plus(
    totalFee
  );
  optionContractData.payoutForDown = calculatePayout(
    BigInt.fromI32(
      optionContractInstance.baseSettlementFeePercentageForBelow()
    )
  );
  optionContractData.payoutForUp = calculatePayout(
    BigInt.fromI32(
      optionContractInstance.baseSettlementFeePercentageForAbove()
    )
  );
  optionContractData.currentUtilization = calculateCurrentUtilization(
    optionContractInstance
  );
  optionContractData.save()
  return tokenReferrenceID;
}

export function updateOpenInterestPerContract(
  increaseInOpenInterest: boolean,
  isAbove: boolean,
  totalFee: BigInt,
  contractAddress: Bytes,
): void {
  let optionContractData = _loadOrCreateOptionContractEntity(contractAddress);
  if (isAbove) {
    optionContractData.openUp = increaseInOpenInterest
      ? (optionContractData.openUp.plus(totalFee))
      : (optionContractData.openUp.minus(totalFee));
  } else {
    optionContractData.openDown = increaseInOpenInterest
      ? (optionContractData.openDown.plus(totalFee))
      : (optionContractData.openDown.minus(totalFee));
  }
  optionContractData.openInterest = increaseInOpenInterest
    ? optionContractData.openInterest.plus(totalFee)
    : optionContractData.openInterest.minus(totalFee);
  optionContractData.save();
}

export function updateOpenInterest(
  timestamp: BigInt,
  increaseInOpenInterest: boolean,
  isAbove: boolean,
  amount: BigInt,
): void {
  let totalId = "total";
  let totalEntity = _loadOrCreateTradingStatEntity(totalId, "total", timestamp);
  if (isAbove) {
    totalEntity.longOpenInterest = increaseInOpenInterest
      ? totalEntity.longOpenInterest.plus(amount)
      : totalEntity.longOpenInterest.minus(amount);
  } else {
    totalEntity.shortOpenInterest = increaseInOpenInterest
      ? totalEntity.shortOpenInterest.plus(amount)
      : totalEntity.shortOpenInterest.minus(amount);
  }
  totalEntity.save();
  let dayID = _getDayId(timestamp);
  let dailyEntity = _loadOrCreateTradingStatEntity(dayID, "daily", timestamp);
  dailyEntity.longOpenInterest = totalEntity.longOpenInterest;
  dailyEntity.shortOpenInterest = totalEntity.shortOpenInterest;
  dailyEntity.save();
}

export function calculateCurrentUtilization(
  optionContractInstance: BufferBinaryOptions
): BigInt {
  let poolAddress = optionContractInstance.pool();
  let poolContractInstance = BinaryPool.bind(poolAddress);
  let currentUtilization = optionContractInstance
    .totalLockedAmount()
    .times(BigInt.fromI64(1000000000000000000))
    .div(poolContractInstance.totalTokenXBalance());
  return currentUtilization;
}

//TODO: Scan Config for settlement fee update
export function calculatePayout(settlementFeePercent: BigInt): BigInt {
  let payout = BigInt.fromI64(1000000000000000000).minus(
    settlementFeePercent.times(BigInt.fromI64(200000000000000))
  );
  return payout;
}

export function _handleCreate(event: Create): void {
  let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
  if (routerContract.contractRegistry(event.address) == true) {
    let optionID = event.params.id;
    let timestamp = event.block.timestamp;
    let contractAddress = event.address;
    let optionContractInstance = BufferBinaryOptions.bind(contractAddress);
    let optionData = optionContractInstance.options(optionID);
    let isAbove = optionData.value6 ? true : false;
    let totalFee = event.params.totalFee;
    let tokenReferrenceID = updateOptionContractData(
      isAbove,
      totalFee,
      contractAddress
    );
    let userOptionData = _loadOrCreateOptionDataEntity(
      optionID,
      contractAddress
    );
    userOptionData.user = event.params.account;
    userOptionData.totalFee = totalFee;
    userOptionData.state = optionData.value0;
    userOptionData.strike = optionData.value1;
    userOptionData.amount = optionData.value2;
    userOptionData.expirationTime = optionData.value5;
    userOptionData.isAbove = isAbove;
    userOptionData.creationTime = optionData.value8;
    userOptionData.settlementFee = event.params.settlementFee;
    userOptionData.depositToken = tokenReferrenceID;
    userOptionData.save();

    if (tokenReferrenceID == "USDC") {
      // Stats
      updateOpenInterest(
        timestamp,
        true,
        userOptionData.isAbove,
        userOptionData.totalFee
      );
      _storeFees(timestamp, event.params.settlementFee);
      _logVolume(timestamp, totalFee);
      let dashboardStat = _loadOrCreateDashboardStat(tokenReferrenceID);
      dashboardStat.totalVolume = dashboardStat.totalVolume.plus(
        event.params.totalFee
      );
      dashboardStat.totalSettlementFees = dashboardStat.totalSettlementFees.plus(
        event.params.settlementFee
      );
      dashboardStat.totalTrades += 1;
      dashboardStat.save();

      // Dashboard
      _logVolumeAndSettlementFeePerContract(
        _getHourId(timestamp),
        "hourly",
        timestamp,
        contractAddress,
        tokenReferrenceID,
        event.params.totalFee,
        event.params.settlementFee
      );

      // Daily
      let dayID = _getDayId(timestamp);
      let feeAndRevenueStat = _loadOrCreateDailyRevenueAndFee(dayID, timestamp);
      feeAndRevenueStat.totalFee = feeAndRevenueStat.totalFee.plus(
        event.params.totalFee
      );
      feeAndRevenueStat.settlementFee = feeAndRevenueStat.settlementFee.plus(
        event.params.settlementFee
      );
      feeAndRevenueStat.save();
      
      let userRewardEntity = _loadOrCreateUserRewards(
        dayID,
        timestamp
      );
      // userRewardEntity.cumulativeReward = userRewardEntity.cumulativeReward.plus((totalFee.times(new BigInt(15000000)).div(new BigInt(100000000))).minus(settlementFee));
      userRewardEntity.save()

      // Weekly
      let weeklyFeeAndRevenueStat = _loadOrCreateWeeklyRevenueAndFee(_getWeekId(timestamp), timestamp);
      weeklyFeeAndRevenueStat.totalFee = weeklyFeeAndRevenueStat.totalFee.plus(
        event.params.totalFee
      );
      weeklyFeeAndRevenueStat.settlementFee = weeklyFeeAndRevenueStat.settlementFee.plus(
        event.params.settlementFee
      );
      weeklyFeeAndRevenueStat.save();
    } else if (tokenReferrenceID == "ARB") {
      _logARBVolume(timestamp, totalFee);
      _storeARBFees(timestamp, event.params.settlementFee);
    }
  }
}
