import { Create, Expire, Exercise, BufferBinaryOptions } from '../generated/BufferBinaryOptions/BufferBinaryOptions'
import { InitiateTrade, CancelTrade, BufferRouter, OpenTrade } from '../generated/BufferRouter/BufferRouter'
import { RouterAddress, State } from './config'
import { UserOptionData } from '../generated/schema'

export function handleInitiateTrade(event: InitiateTrade): void {
  let contract = BufferRouter.bind(event.address)
  let queueID = event.params.queueId
  let queuedTradeData = contract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6
  if (contract.contractRegistry(contractAddress)) {
    let state = State.queued
    let referrenceID = `${queueID}${contractAddress}${state}`
    let userOptionData = new UserOptionData(referrenceID)
    userOptionData.queueID = queueID
    userOptionData.userAddress = event.params.account
    userOptionData.state = state
    userOptionData.strike = queuedTradeData.value7
    userOptionData.totalFee = queuedTradeData.value3
    userOptionData.contractAddress = contractAddress
    userOptionData.slippage = queuedTradeData.value8
    userOptionData.isAbove = queuedTradeData.value5 ? true : false
    userOptionData.depositToken = "USDC"
    userOptionData.save()
  }
}

export function handleCreate(event: Create): void {
  let optionID = event.params.id
  let contractAddress = event.address
  let optionContract = BufferBinaryOptions.bind(contractAddress)

  let routerContract = BufferRouter.bind(RouterAddress)
  let isContracctRegistered = routerContract.contractRegistry(contractAddress)
  if (isContracctRegistered) {
    let optionData = optionContract.options(optionID)
    let referrenceID = `${optionID}${contractAddress}${optionData.value0}`
    let userOptionData = new UserOptionData(referrenceID)
    userOptionData.optionID = event.params.id
    userOptionData.userAddress = event.params.account
    userOptionData.settlementFee = event.params.settlementFee
    userOptionData.totalFee = event.params.totalFee
    userOptionData.state = optionData.value0
    userOptionData.strike = optionData.value1
    userOptionData.amount = optionData.value2
    userOptionData.expirationTime = optionData.value5
    userOptionData.isAbove = optionData.value6 ? true : false
    userOptionData.creationTime = optionData.value8
    userOptionData.contractAddress = contractAddress
    userOptionData.depositToken = "USDC"
    userOptionData.save()
  }
}

export function handleOpenTrade(event: OpenTrade): void {
  let routerContract = BufferRouter.bind(event.address)
  let queueID = event.params.queueId
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6
  if (routerContract.contractRegistry(contractAddress)) {
    let queueReferrenceID = `${queueID}${contractAddress}${State.queued}`  
    let userQueuedData = UserOptionData.load(queueReferrenceID)
    if (userQueuedData != null) {
      userQueuedData.state = State.undefined
      userQueuedData.save()  
      let optionReferrenceID = `${event.params.optionId}${contractAddress}${State.active}` 
      let userOptionData = UserOptionData.load(optionReferrenceID)
      if (userOptionData != null) {
        userOptionData.queueID = queueID
        userOptionData.save()  
      } else {
        throw new Error('Corresponding option does not exist')
      } 
    } else {
      throw new Error('Corresponding queued trade does not exist')
    }
  }
}

export function handleCancelTrade (event: CancelTrade): void {
  let queueID = event.params.queueId
  let routerContract = BufferRouter.bind(event.address)
  let queuedTradeData = routerContract.queuedTrades(queueID)
  let contractAddress = queuedTradeData.value6
  if (routerContract.contractRegistry(contractAddress)) {
    let referrenceID = `${queueID}${contractAddress}${State.queued}`
    let userOptionData = UserOptionData.load(referrenceID)
    if (userOptionData != null) {
      userOptionData.state = State.cancelled
      userOptionData.save()
    } else {
      throw new Error('Corresponding queued trade does not exist')
    }
  }
}


export function handleExercise(event: Exercise): void {
  let contract = BufferRouter.bind(RouterAddress)
  let isContracctRegistered = contract.contractRegistry(event.address)
  if (isContracctRegistered) {
    let referrenceID = `${event.params.id}${event.address}${State.active}`
    let userOptionData = UserOptionData.load(referrenceID)
    if (userOptionData != null) {
      userOptionData.state = State.exercised
      userOptionData.payout = event.params.profit
      userOptionData.expirationPrice = event.params.priceAtExpiration
      userOptionData.save()  
    } else {
      throw new Error('Corresponding trade does not exist')
    }
  }
}


export function handleExpire(event: Expire): void {
  let contract = BufferRouter.bind(RouterAddress)
  let isContracctRegistered = contract.contractRegistry(event.address)
  if (isContracctRegistered) {
    let referrenceID = `${event.params.id}${event.address}${State.active}`
    let userOptionData = UserOptionData.load(referrenceID)
    if (userOptionData != null) {
      userOptionData.state = State.expired
      userOptionData.expirationPrice = event.params.priceAtExpiration
      userOptionData.save()  
    } else {
      throw new Error('Corresponding trade does not exist')
    }
  }
}

