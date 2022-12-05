import { Create, Expire, Exercise, BufferBinaryOptions, UpdateReferral } from '../generated/BufferBinaryOptions/BufferBinaryOptions'
import { InitiateTrade, CancelTrade, BufferRouter, OpenTrade } from '../generated/BufferRouter/BufferRouter'
import { State } from './config'
import { UserOptionData, User, OptionContract, QueuedOptionData, ReferralData, OptionStat} from '../generated/schema'
import { BigInt } from '@graphprotocol/graph-ts'
import { _handleCreate, _storePnl, _updateOpenInterest } from './core'

export function handleInitiateTrade(event: InitiateTrade): void {
  let routerContract = BufferRouter.bind(event.address)
  let queueID = event.params.queueId
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6

  let user = User.load(event.params.account)
  if (user == null) {
    let user = new User(event.params.account)
    user.address = event.params.account
    user.allActiveTrades = 0
    user.allExercisedTrades = 0
    user.allExpiredTrades = 0
    user.allTradesCount = 0
    user.save()  
  }

  let optionContract = OptionContract.load(contractAddress)
  if (optionContract == null) {
    let optionContract = new OptionContract(contractAddress)
    optionContract.address = contractAddress
    optionContract.save()  
  } 

  if (routerContract.contractRegistry(contractAddress)) {
    let referrenceID = `${queueID}${contractAddress}`
    let userOptionData = new QueuedOptionData(referrenceID)
    userOptionData.queueID = queueID
    userOptionData.user = event.params.account
    userOptionData.state = State.queued
    userOptionData.strike = queuedTradeData.value7
    userOptionData.totalFee = queuedTradeData.value3
    userOptionData.optionContract = contractAddress
    userOptionData.slippage = queuedTradeData.value8
    userOptionData.isAbove = queuedTradeData.value5 ? true : false
    userOptionData.save()
  }
}


export function handleOpenTrade(event: OpenTrade): void {
  let routerContract = BufferRouter.bind(event.address)
  let queueID = event.params.queueId
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6
  let optionID = event.params.optionId
  let optionReferrenceID = `${optionID}${contractAddress}`
  if (routerContract.contractRegistry(contractAddress)) {
    let queueReferrenceID = `${queueID}${contractAddress}`  
    let userQueuedData = QueuedOptionData.load(queueReferrenceID)
    if (userQueuedData != null) {
      userQueuedData.state = State.undefined
      userQueuedData.save()  
    } 
    let userOptionData = UserOptionData.load(optionReferrenceID)
    if (userOptionData != null) {
      userOptionData.queueID = queueID
      userOptionData.save()  
    }
  }
}


export function handleCreateForUSDC(event: Create): void {
  _handleCreate(event, 'USDC')
}


export function handleCreateForBFR(event: Create): void {
  _handleCreate(event, 'BFR')
}


export function handleCancelTrade (event: CancelTrade): void {
  let queueID = event.params.queueId
  let routerContract = BufferRouter.bind(event.address)
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6
  if (routerContract.contractRegistry(contractAddress)) {
    let referrenceID = `${queueID}${contractAddress}`
    let userQueuedData = QueuedOptionData.load(referrenceID)
    if (userQueuedData != null) {
      userQueuedData.state = State.cancelled
      userQueuedData.reason = event.params.reason
      userQueuedData.save()
    } else {
      throw new Error('Corresponding queued trade does not exist')
    }
  }
}


export function handleExercise(event: Exercise): void {
  let
  referrenceID = `${event.params.id}${event.address}`
  let userOptionData = UserOptionData.load(referrenceID)
  _storePnl(event.block.timestamp, event.params.profit, true)
  if (userOptionData != null) {
    let user = userOptionData.user
    userOptionData.state = State.exercised
    userOptionData.payout = event.params.profit
    userOptionData.expirationPrice = event.params.priceAtExpiration
    userOptionData.save()  
    if (userOptionData.isAbove) {
      _updateOpenInterest(event.block.timestamp, false, true, userOptionData.amount)
    } else {
      _updateOpenInterest(event.block.timestamp, false, false, userOptionData.amount)
    }
    let userObject = User.load(user)
    if (userObject != null) {
      userObject.allExercisedTrades = userObject.allExercisedTrades + 1
      userObject.allActiveTrades = userObject.allActiveTrades - 1
      userObject.save()  
    } else{
      throw new Error('Corresponding user does not exist')
    } 
  } 
}


export function handleExpire(event: Expire): void {
  let referrenceID = `${event.params.id}${event.address}`
  let userOptionData = UserOptionData.load(referrenceID)
  _storePnl(event.block.timestamp, event.params.premium, false)
  if (userOptionData != null) {
    let user = userOptionData.user
    userOptionData.state = State.expired
    userOptionData.expirationPrice = event.params.priceAtExpiration
    userOptionData.save()  
    if (userOptionData.isAbove) {
      _updateOpenInterest(event.block.timestamp, false, true, userOptionData.amount)
    } else {
      _updateOpenInterest(event.block.timestamp, false, false, userOptionData.amount)
    }
    let userObject = User.load(user)
    if (userObject != null) {
      userObject.allExpiredTrades = userObject.allExpiredTrades + 1
      userObject.allActiveTrades = userObject.allActiveTrades - 1
      userObject.save()  
    } else{
      throw new Error('Corresponding user does not exist')
    } 
  } 
}


export function handleUpdateReferral(event: UpdateReferral): void {
  let user = event.params.user
  let referrer = event.params.referrer
  const zero = new BigInt(0)
  
  let userReferralDataV1 = ReferralData.load(user)
  if (userReferralDataV1 == null) {
    let userReferralDataTemp = new ReferralData(user)
    userReferralDataTemp.user = user
    userReferralDataTemp.totalDiscountAvailed = zero
    userReferralDataTemp.totalRebateEarned = zero
    userReferralDataTemp.totalTradesReferred = 0
    userReferralDataTemp.totalTradingVolume = event.params.totalFee
    userReferralDataTemp.totalVolumeOfReferredTrades = zero
    userReferralDataTemp.save()
    if (event.params.isReferralValid) {
      let discount = event.params.rebate.div(BigInt.fromI32(6))
      userReferralDataTemp.totalDiscountAvailed = userReferralDataTemp.totalDiscountAvailed.plus(discount)
      userReferralDataTemp.save() 
    }  
  } else {
    if (event.params.isReferralValid) {
      let discount = event.params.rebate.div(BigInt.fromI32(6))
      userReferralDataV1.totalDiscountAvailed = userReferralDataV1.totalDiscountAvailed.plus(discount)
      userReferralDataV1.totalTradingVolume = userReferralDataV1.totalTradingVolume.plus(event.params.totalFee)
      userReferralDataV1.save() 
    }  
  }

  let referrerReferralDataV1 = ReferralData.load(referrer)
  if (referrerReferralDataV1 == null) {
    let referrerReferralDataV1Temp = new ReferralData(referrer)
    referrerReferralDataV1Temp.user = referrer
    referrerReferralDataV1Temp.totalDiscountAvailed = zero
    referrerReferralDataV1Temp.totalRebateEarned = event.params.referrerFee
    referrerReferralDataV1Temp.totalTradesReferred = 1
    referrerReferralDataV1Temp.totalTradingVolume = zero
    referrerReferralDataV1Temp.totalVolumeOfReferredTrades = event.params.totalFee
    referrerReferralDataV1Temp.save()  
  } else {
    referrerReferralDataV1.totalTradesReferred = referrerReferralDataV1.totalTradesReferred + 1
    referrerReferralDataV1.totalVolumeOfReferredTrades = referrerReferralDataV1.totalVolumeOfReferredTrades.plus(event.params.totalFee)
    referrerReferralDataV1.totalRebateEarned = referrerReferralDataV1.totalRebateEarned.plus(event.params.referrerFee)
    referrerReferralDataV1.save()   
  }
}

