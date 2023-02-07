import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Create,
  BufferBinaryOptions,
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import { BinaryPool } from "../generated/BinaryPool/BinaryPool";
import { User, VolumePerContract } from "../generated/schema";
import { _getDayId, _getHourId, _checkIfUserInArray } from "./helpers";
import {
  _loadOrCreateOptionContractEntity,
  _loadOrCreateOptionDataEntity,
  _loadOrCreateQueuedOptionEntity,
  _loadOrCreateVolumeStat,
  _loadOrCreateTradingStatEntity,
  _loadOrCreateFeeStat,
  _loadOrCreateUserStat,
  _loadOrCreateDashboardStat,
} from "./initialize";
import { BufferRouter } from "../generated/BufferRouter/BufferRouter";
import {
  DailyUserStat
} from "../generated/schema";
import { State, RouterAddress, BFR, USDC } from "./config";

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

function _storeFees(timestamp: BigInt, fees: BigInt): void {
  let id = _getDayId(timestamp);
  let entity = _loadOrCreateFeeStat(id, "daily", timestamp);
  entity.fee = entity.fee.plus(fees);
  entity.save();

  let totalEntity = _loadOrCreateFeeStat("total", "total", timestamp);
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

export function updateOpenInterest(
  timestamp: BigInt,
  increaseInOpenInterest: boolean,
  isAbove: boolean,
  amount: BigInt,
  contractAddress: Bytes
): void {
  let optionContractData = _loadOrCreateOptionContractEntity(contractAddress);
  let totalId = "total";
  let totalEntity = _loadOrCreateTradingStatEntity(totalId, "total", timestamp);

  if (isAbove) {
    totalEntity.longOpenInterest = increaseInOpenInterest
      ? totalEntity.longOpenInterest.plus(amount)
      : totalEntity.longOpenInterest.minus(amount);
    optionContractData.openUp = increaseInOpenInterest
      ? (optionContractData.openUp += 1)
      : (optionContractData.openUp -= 1);
  } else {
    totalEntity.shortOpenInterest = increaseInOpenInterest
      ? totalEntity.shortOpenInterest.plus(amount)
      : totalEntity.shortOpenInterest.minus(amount);
    optionContractData.openDown = increaseInOpenInterest
      ? (optionContractData.openDown += 1)
      : (optionContractData.openDown -= 1);
  }
  optionContractData.openInterest = increaseInOpenInterest
    ? optionContractData.openInterest.plus(amount)
    : optionContractData.openInterest.minus(amount);

  totalEntity.save();
  optionContractData.save();

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
    let optionContractData = _loadOrCreateOptionContractEntity(contractAddress);
    optionContractData.currentUtilization = calculateCurrentUtilization(
      optionContractInstance
    );
    optionContractData.tradeCount += 1;
    optionContractData.volume = optionContractData.volume.plus(
      event.params.totalFee
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
    let tokenReferrenceID = "";
    if (optionContractInstance.tokenX() == Address.fromString(USDC)) {
      tokenReferrenceID = "USDC";
    } else if (optionContractInstance.tokenX() == Address.fromString(BFR)) {
      tokenReferrenceID = "BFR";
    }
    optionContractData.token = tokenReferrenceID;
    optionContractData.save();
    let userOptionData = _loadOrCreateOptionDataEntity(
      optionID,
      contractAddress
    );
    userOptionData.user = event.params.account;
    userOptionData.totalFee = event.params.totalFee;
    userOptionData.state = optionData.value0;
    userOptionData.strike = optionData.value1;
    userOptionData.amount = optionData.value2;
    userOptionData.expirationTime = optionData.value5;
    userOptionData.isAbove = optionData.value6 ? true : false;
    userOptionData.creationTime = optionData.value8;
    userOptionData.settlementFee = event.params.settlementFee;
    userOptionData.depositToken = tokenReferrenceID;
    userOptionData.save();

    if (optionContractInstance.tokenX() == Address.fromString(USDC)) {
      // Stats
      let totalFee = userOptionData.totalFee.div(BigInt.fromI32(1000000));
      updateOpenInterest(
        timestamp,
        true,
        userOptionData.isAbove,
        userOptionData.totalFee,
        contractAddress
      );
      let settlementFee = event.params.settlementFee.div(
        BigInt.fromI32(1000000)
      );
      _storeFees(timestamp, settlementFee);
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
    }
  }
}
