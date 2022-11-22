import { Expire, Exercise, BufferBinaryOptions, UpdateReferral } from '../generated/BufferBinaryOptions/BufferBinaryOptions'
import { InitiateTrade, CancelTrade, BufferRouter, OpenTrade } from '../generated/BufferRouter/BufferRouter'
import { State } from './config'
import { UserOptionData, QueuedOptionData, OptionContract, User, ReferralData, OptionStats} from '../generated/schema'

export function handleInitiateTrade(event: InitiateTrade): void {
  let routerContract = BufferRouter.bind(event.address)
  let queueID = event.params.queueId
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6

  // Checks for an existing user, if not, it creates one
  let user = User.load(event.params.account)
  if (user == null) {
    let user = new User(event.params.account)
    user.address = event.params.account
    user.save()  
  }

  // Checks for an contract, if not, it creates one
  let optionContract = OptionContract.load(contractAddress)
  if (optionContract == null) {
    let optionContract = new OptionContract(contractAddress)
    // let optionContractInstance = BufferBinaryOptions.bind(event.address)
    // optionContract.asset = optionContractInstance.assetPair()
    // optionContract.isPaused = optionContractInstance.isPaused() ? true : false
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
    userOptionData.depositToken = "USDC"
    userOptionData.save()
  }
}

export function handleOpenTrade(event: OpenTrade): void {

  let routerContract = BufferRouter.bind(event.address)
  let queueID = event.params.queueId
  let optionID = event.params.optionId
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6

  // Checks for an existing user, if not, raises an error
  let user = User.load(event.params.account)
  if (user != null) {
    user.address = event.params.account
    // user.allActiveTrades = user.allActiveTrades + 1
    // user.allTradesCount = user.allTradesCount + 1
    user.save()  
  } else{
    throw new Error('Corresponding user does not exist')
  }

  if (routerContract.contractRegistry(contractAddress)) {
    let queueReferrenceID = `${queueID}${contractAddress}`  
    let userQueuedData = QueuedOptionData.load(queueReferrenceID)
    if (userQueuedData != null) {
      userQueuedData.state = State.undefined
      userQueuedData.save()  
    } else {
      throw new Error('Corresponding queued trade does not exist')
    }
    // let optionContractInstance = BufferBinaryOptions.bind(contractAddress) 
    // let optionData = optionContractInstance.options(optionID)
    // let referrenceID = `${optionID}${contractAddress}`
    // let userOptionData = new UserOptionData(referrenceID)
    // userOptionData.optionID = event.params.optionId
    // userOptionData.user = event.params.account
    // userOptionData.totalFee = optionData.value7
    // userOptionData.state = optionData.value0
    // userOptionData.strike = optionData.value1
    // userOptionData.amount = optionData.value2
    // userOptionData.expirationTime = optionData.value5
    // userOptionData.isAbove = optionData.value6 ? true : false
    // userOptionData.creationTime = optionData.value8
    // userOptionData.optionContract = contractAddress
    // userOptionData.depositToken = "USDC"
    // userOptionData.queueID = queueID
    // userOptionData.save()
  }
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
      userQueuedData.save()
    } else {
      throw new Error('Corresponding queued trade does not exist')
    }
  }
}

export function handleExercise(event: Exercise): void {
  let referrenceID = `${event.params.id}${event.address}`
  let userOptionData = UserOptionData.load(referrenceID)
  if (userOptionData != null) {
    let user = userOptionData.user
    userOptionData.state = State.exercised
    userOptionData.payout = event.params.profit
    userOptionData.expirationPrice = event.params.priceAtExpiration
    userOptionData.save()  

    let userObject = User.load(user)
    if (userObject != null) {
      // userObject.allExercisedTrades = userObject.allExercisedTrades + 1
      userObject.save()  
    } else{
      throw new Error('Corresponding user does not exist')
    } 

  } 
}

export function handleExpire(event: Expire): void {
  let referrenceID = `${event.params.id}${event.address}`
  let userOptionData = UserOptionData.load(referrenceID)
  if (userOptionData != null) {
    let user = userOptionData.user
    userOptionData.state = State.expired
    userOptionData.expirationPrice = event.params.priceAtExpiration
    userOptionData.save()  

    let userObject = User.load(user)
    if (userObject != null) {
      // userObject.allExpiredTrades = userObject.allExpiredTrades + 1
      userObject.save()  
    } else{
      throw new Error('Corresponding user does not exist')
    } 
  } 
}

export function handleUpdateReferral(event: UpdateReferral): void {
  let user = event.params.user
  let referrer = event.params.referrer
  
  let userReferralDataV1 = ReferralData.load(user)
  if (userReferralDataV1 == null) {
    let userReferralDataTemp = new ReferralData(user)
    userReferralDataTemp.user = user
    userReferralDataTemp.totalDiscountAvailed = 0
    userReferralDataTemp.totalRebateEarned = 0
    userReferralDataTemp.totalTradersReferred = 0
    userReferralDataTemp.totalTradingVolume = 0
    userReferralDataTemp.totalVolumeOfReferredTrades = 0
    userReferralDataTemp.save()  
  } 

  let referrerReferralDataV1 = ReferralData.load(referrer)
  if (referrerReferralDataV1 == null) {
    let referrerReferralDataTemp = new ReferralData(referrer)
    referrerReferralDataTemp.user = user
    referrerReferralDataTemp.totalDiscountAvailed = 0
    referrerReferralDataTemp.totalRebateEarned = 0
    referrerReferralDataTemp.totalTradersReferred = 0
    referrerReferralDataTemp.totalTradingVolume = 0
    referrerReferralDataTemp.totalVolumeOfReferredTrades = 0
    referrerReferralDataTemp.save()  
  } 

  let userReferralDataV2 = ReferralData.load(user)
  if (userReferralDataV2 != null) {
    userReferralDataV2.totalDiscountAvailed = userReferralDataV2.totalDiscountAvailed + 0
    userReferralDataV2.totalTradingVolume = userReferralDataV2.totalDiscountAvailed + 0
    userReferralDataV2.save()  
  } 

  let referrerReferralDataV2 = ReferralData.load(referrer)
  if (referrerReferralDataV2 != null) {
    referrerReferralDataV2.totalTradersReferred = referrerReferralDataV2.totalTradersReferred + 1
    referrerReferralDataV2.totalVolumeOfReferredTrades = referrerReferralDataV2.totalVolumeOfReferredTrades + 1
    referrerReferralDataV2.totalRebateEarned = referrerReferralDataV2.totalRebateEarned + 1
    referrerReferralDataV2.save()  
  } 
  
}