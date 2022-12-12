import { BigInt, Address } from "@graphprotocol/graph-ts"
import { Create, Expire, Exercise, BufferBinaryOptions, UpdateReferral } from '../generated/BufferBinaryOptions/BufferBinaryOptions'
import { UserOptionData, User, OptionContract, OptionStat, TradingStat, UserStat, FeeStat, VolumeStat} from '../generated/schema'
import { timestampToDay, _getDayId } from './helpers'
let ZERO = BigInt.fromI32(0)

export function _handleCreate(event: Create, tokenReferrenceID: string): void {
  let optionID = event.params.id
  let contractAddress = event.address
  let contract = BufferBinaryOptions.bind(contractAddress)
  let optionData = contract.options(optionID)
  let referrenceID = `${event.params.id}${contractAddress}`
  let userOptionData = new UserOptionData(referrenceID)
  let user = User.load(event.params.account)
  if (user != null) {
    user.address = event.params.account
    user.allActiveTrades = user.allActiveTrades + 1
    user.allTradesCount = user.allTradesCount + 1
    user.save()  
  }
  let optionContract = OptionContract.load(contractAddress)
  if (optionContract != null) {
    let optionContractInstance = BufferBinaryOptions.bind(event.address)
    optionContract.asset = optionContractInstance.assetPair()
    optionContract.isPaused = optionContractInstance.isPaused() ? true : false
    optionContract.address = contractAddress
    optionContract.save()  
  } 
  userOptionData.optionID = event.params.id
  userOptionData.user = event.params.account
  userOptionData.totalFee = event.params.totalFee
  userOptionData.state = optionData.value0
  userOptionData.strike = optionData.value1
  userOptionData.amount = optionData.value2
  userOptionData.expirationTime = optionData.value5
  userOptionData.isAbove = optionData.value6 ? true : false
  userOptionData.creationTime = optionData.value8
  userOptionData.optionContract = contractAddress
  userOptionData.settlementFee = event.params.settlementFee
  userOptionData.depositToken = tokenReferrenceID
  userOptionData.save()
  if (tokenReferrenceID == "USDC") {
    let amount = optionData.value2.div(BigInt.fromI64(1000000))
    let totalFee = event.params.totalFee.div(BigInt.fromI64(1000000))
    let settlementFee = event.params.settlementFee.div(BigInt.fromI64(1000000))
    _storeVolume(event.block.timestamp,totalFee)
    if (optionData.value1) {
      _updateOpenInterest(event.block.timestamp, true, true, amount)
    } else {
      _updateOpenInterest(event.block.timestamp, true, false, amount)
    }
    _storeFees(event.block.timestamp, settlementFee)
  }

  let optionStats = OptionStat.load(tokenReferrenceID)
  if (optionStats == null) {
    let optionStats = new  OptionStat(tokenReferrenceID)
    optionStats.currentAbovePositions = ZERO
    optionStats.currentBelowPositions = ZERO
    optionStats.totalSettlementFees = ZERO
    optionStats.totalVolume = ZERO
    optionStats.save()
  } 
  let optionStatsV1 = OptionStat.load(tokenReferrenceID)
  if (optionStatsV1 != null) { 
    if (optionData.value6) {
      optionStatsV1.currentAbovePositions = optionStatsV1.currentAbovePositions.plus(event.params.totalFee)
    } else {
      optionStatsV1.currentBelowPositions = optionStatsV1.currentBelowPositions.plus(event.params.totalFee)
    }
    optionStatsV1.totalVolume = optionStatsV1.totalVolume.plus(event.params.totalFee)
    optionStatsV1.totalSettlementFees = optionStatsV1.totalSettlementFees.plus(event.params.settlementFee)
    optionStatsV1.save()
  }
}


function _loadOrCreateEntity(id: string, period: string, timestamp: BigInt): TradingStat {
  let entity = TradingStat.load(id)
  if (entity == null) {
    entity = new TradingStat(id)
    entity.period = period
    entity.profit = ZERO
    entity.loss = ZERO
    entity.profitCumulative = ZERO
    entity.lossCumulative = ZERO
    entity.longOpenInterest = ZERO
    entity.shortOpenInterest = ZERO
  }
  entity.timestamp = timestamp.toI32()
  return entity as TradingStat
}


export function _storePnl(timestamp: BigInt, pnl: BigInt, isProfit: boolean): void {
  let dayTimestamp = timestampToDay(timestamp)

  let totalId = "total"
  let totalEntity = _loadOrCreateEntity(totalId, "total", dayTimestamp)
  if (isProfit) {
    totalEntity.profit = totalEntity.profit.plus(pnl)
    totalEntity.profitCumulative = totalEntity.profitCumulative.plus(pnl)
  } else {
    totalEntity.loss = totalEntity.loss.plus(pnl)
    totalEntity.lossCumulative = totalEntity.lossCumulative.plus(pnl)
  }
  totalEntity.timestamp = dayTimestamp.toI32()
  totalEntity.save()

  let id = dayTimestamp.toString()
  let entity = _loadOrCreateEntity(id, "daily", dayTimestamp)

  if (isProfit) {
    entity.profit = entity.profit.plus(pnl)
  } else {
    entity.loss = entity.loss.plus(pnl)
  }
  entity.profitCumulative = totalEntity.profitCumulative
  entity.lossCumulative = totalEntity.lossCumulative
  entity.save()
}

export function _updateOpenInterest(timestamp: BigInt, increase: boolean, isLong: boolean, delta: BigInt): void {
  let dayTimestamp = timestampToDay(timestamp)
  let totalId = "total"
  let totalEntity = _loadOrCreateEntity(totalId, "total", dayTimestamp)

  if (isLong) {
    totalEntity.longOpenInterest = increase ? totalEntity.longOpenInterest.plus(delta) : totalEntity.longOpenInterest.minus(delta)
  } else {
    totalEntity.shortOpenInterest = totalEntity.shortOpenInterest.plus(delta)
  }
  totalEntity.save()

  let id = dayTimestamp.toString()
  let entity = _loadOrCreateEntity(id, "daily", dayTimestamp)

  entity.longOpenInterest = totalEntity.longOpenInterest
  entity.shortOpenInterest = totalEntity.shortOpenInterest
  entity.save()
}

function _getOrCreateUserStat(id: string, period: string, timestamp: BigInt): UserStat {
  let userStat = UserStat.load(id)
  if (userStat == null) {
    userStat = new UserStat(id)
    userStat.period = period
    userStat.timestamp = timestamp
    userStat.uniqueCount = 0
    userStat.uniqueCountCumulative = 0
  }
  return userStat as UserStat
}

export function _storeUser(
  timestamp: BigInt,
  account: Address
): void {
  let user = User.load(account)
  if (user == null) {
    let id = _getDayId(timestamp)
    let userStat = _getOrCreateUserStat(id, "daily", timestamp)
    userStat.uniqueCount = userStat.uniqueCount + 1
    userStat.save()
  
    let totalUserStat = _getOrCreateUserStat("total", "total", timestamp)
    totalUserStat.uniqueCountCumulative = totalUserStat.uniqueCountCumulative + 1
    totalUserStat.save()
  }
}

function _getOrCreateFeeStat(id: string, period: string, timestamp: BigInt): FeeStat {
  let entity = FeeStat.load(id)
  if (entity === null) {
    entity = new FeeStat(id)
    entity.period = period
    entity.timestamp = timestamp
    entity.fee = ZERO
    entity.save()
  }
  return entity as FeeStat
}

export function _storeFees(timestamp: BigInt, fees: BigInt): void {
  let id = _getDayId(timestamp)
  let entity = _getOrCreateFeeStat(id, "daily", timestamp)
  entity.fee = entity.fee.plus(fees)
  entity.save()

  let totalEntity = _getOrCreateFeeStat("total", "total", timestamp)
  totalEntity.fee = totalEntity.fee.plus(fees)
  totalEntity.save()
}


function _getOrCreateVolumeStat(id: string, period: string, timestamp: BigInt): VolumeStat {
  let entity = VolumeStat.load(id)
  if (entity === null) {
    entity = new VolumeStat(id)
    entity.period = period
    entity.timestamp = timestamp
    entity.amount = ZERO
    entity.save()
  }
  return entity as VolumeStat
}

export function _storeVolume(timestamp: BigInt, amount: BigInt): void {
  let id = _getDayId(timestamp)
  let entity = _getOrCreateVolumeStat(id, "daily", timestamp)
  entity.amount = entity.amount.plus(amount)
  entity.save()

  let totalEntity = _getOrCreateVolumeStat("total", "total", timestamp)
  totalEntity.amount = totalEntity.amount.plus(amount)
  totalEntity.save()
}
