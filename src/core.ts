import { BigInt } from "@graphprotocol/graph-ts"
import { Create, Expire, Exercise, BufferBinaryOptions, UpdateReferral } from '../generated/BufferBinaryOptions/BufferBinaryOptions'
import { UserOptionData, User, OptionContract, OptionStat, TradingStat} from '../generated/schema'
import { timestampToDay } from './helpers'
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
  userOptionData.save()

  if (optionData.value1) {
    _updateOpenInterest(event.block.timestamp, true, true, optionData.value2)
  } else {
    _updateOpenInterest(event.block.timestamp, true, false, optionData.value2)
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
    totalEntity.loss = totalEntity.loss.minus(pnl)
    totalEntity.lossCumulative = totalEntity.lossCumulative.minus(pnl)
  }
  totalEntity.timestamp = dayTimestamp.toI32()
  totalEntity.save()

  let id = dayTimestamp.toString()
  let entity = _loadOrCreateEntity(id, "daily", dayTimestamp)

  if (isProfit) {
    entity.profit = entity.profit.plus(pnl)
  } else {
    entity.loss = entity.loss.minus(pnl)
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
    totalEntity.shortOpenInterest = increase ? totalEntity.shortOpenInterest.plus(delta) : totalEntity.shortOpenInterest.minus(delta)
  }
  totalEntity.save()

  let id = dayTimestamp.toString()
  let entity = _loadOrCreateEntity(id, "daily", dayTimestamp)

  entity.longOpenInterest = totalEntity.longOpenInterest
  entity.shortOpenInterest = totalEntity.shortOpenInterest
  entity.save()
}

