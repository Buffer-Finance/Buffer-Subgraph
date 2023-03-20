import {
    Create,
    Expire,
    Exercise,
    UpdateReferral,
    Pause,
    BufferBinaryOptions
} from "../generated/BufferBinaryOptions/BufferBinaryOptions";
import {
    BinaryPool,
    Provide,
    Withdraw,
    Profit,
    Loss
} from "../generated/BinaryPool/BinaryPool";
import {
    USDC
} from "../generated/USDC/USDC";
import {
    InitiateTrade,
    CancelTrade,
    BufferRouter,
    OpenTrade
} from "../generated/BufferRouter/BufferRouter";
import { State, RouterAddress, BFR, USDC_ADDRESS, ARBITRUM_SOLANA_ADDRESS } from "./config";
import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import {
    _handleCreate,
    storePnl,
    storePnlPerContract,
    updateOpenInterest,
    logUser,
    calculateCurrentUtilization
} from "./core";
import {
    _loadOrCreateLeaderboardEntity,
    _loadOrCreateWeeklyLeaderboardEntity,
    _loadOrCreateOptionContractEntity,
    _loadOrCreateOptionDataEntity,
    _loadOrCreateQueuedOptionEntity,
    _loadOrCreateReferralData,
    _loadOrCreatePoolStat,
    _loadOrCreateUserRewards
} from "./initialize";
import { _getDayId, _getWeekId } from "./helpers";
import { UserOptionData } from "../generated/schema";

export function handleInitiateTrade(event: InitiateTrade): void {
    let routerContract = BufferRouter.bind(event.address);
    let queueID = event.params.queueId;
    let queuedTradeData = routerContract.queuedTrades(queueID);
    let contractAddress = queuedTradeData.value6;
    _loadOrCreateOptionContractEntity(contractAddress);
    logUser(event.block.timestamp, event.params.account);
    let queuedOptionData = _loadOrCreateQueuedOptionEntity(
        queueID,
        contractAddress
    );
    queuedOptionData.user = event.params.account;
    queuedOptionData.state = State.queued;
    queuedOptionData.strike = queuedTradeData.value7;
    queuedOptionData.totalFee = queuedTradeData.value3;
    queuedOptionData.slippage = queuedTradeData.value8;
    queuedOptionData.isAbove = queuedTradeData.value5 ? true : false;
    queuedOptionData.queuedTimestamp = event.block.timestamp;
    queuedOptionData.save();
}

export function handleOpenTrade(event: OpenTrade): void {
    let routerContract = BufferRouter.bind(event.address);
    let queueID = event.params.queueId;
    let contractAddress = routerContract.queuedTrades(queueID).value6;
    let userQueuedData = _loadOrCreateQueuedOptionEntity(
        queueID,
        contractAddress
    );
    userQueuedData.lag = event.block.timestamp.minus(
        userQueuedData.queuedTimestamp
    );
    userQueuedData.processTime = event.block.timestamp;
    userQueuedData.state = State.opened;
    userQueuedData.save();
    let userOptionData = _loadOrCreateOptionDataEntity(
        event.params.optionId,
        contractAddress
    );
    userOptionData.queueID = queueID;
    userOptionData.queuedTimestamp = userQueuedData.queuedTimestamp;
    userOptionData.lag = event.block.timestamp.minus(
        userQueuedData.queuedTimestamp
    );
    userOptionData.save();
}

export function handleCreate(event: Create): void {
    _handleCreate(event);
}

export function handleCancelTrade(event: CancelTrade): void {
    let queueID = event.params.queueId;
    let routerContract = BufferRouter.bind(event.address);
    let contractAddress = routerContract.queuedTrades(queueID).value6;
    let userQueuedData = _loadOrCreateQueuedOptionEntity(
        queueID,
        contractAddress
    );
    userQueuedData.state = State.cancelled;
    userQueuedData.reason = event.params.reason;
    userQueuedData.save();
}

export function handleExercise(event: Exercise): void {
    let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
    if ((routerContract.contractRegistry(event.address) == true) || (event.address == Address.fromString(ARBITRUM_SOLANA_ADDRESS))) {
        let userOptionData = _loadOrCreateOptionDataEntity(
            event.params.id,
            event.address
        );
        userOptionData.state = State.exercised;
        userOptionData.payout = event.params.profit;
        userOptionData.expirationPrice = event.params.priceAtExpiration;
        userOptionData.save();
        let optionContractInstance = BufferBinaryOptions.bind(event.address);
        let optionContractData = _loadOrCreateOptionContractEntity(
            event.address
        );
        optionContractData.currentUtilization = calculateCurrentUtilization(
            optionContractInstance
        );
        let timestamp = userOptionData.creationTime;
        optionContractData.save();
        if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
            updateOpenInterest(
                timestamp,
                false,
                userOptionData.isAbove,
                userOptionData.totalFee,
                event.address
            );
            let profit = userOptionData.totalFee.minus(userOptionData.settlementFee);
            storePnl(timestamp, profit, true);
            storePnlPerContract(timestamp, profit, true, event.address);

            // Leaderboard
            let leaderboardEntity = _loadOrCreateLeaderboardEntity(
                _getDayId(timestamp),
                userOptionData.user
            );
            leaderboardEntity.volume = leaderboardEntity.volume.plus(
                userOptionData.totalFee
            );
            leaderboardEntity.totalTrades = leaderboardEntity.totalTrades + 1;
            leaderboardEntity.netPnL = leaderboardEntity.netPnL.plus(
                event.params.profit.minus(userOptionData.totalFee)
            );
            leaderboardEntity.save();

            // Weekly Leaderboard
            let WeeklyLeaderboardEntity = _loadOrCreateWeeklyLeaderboardEntity(
                _getWeekId(timestamp),
                userOptionData.user
            );
            WeeklyLeaderboardEntity.volume = WeeklyLeaderboardEntity.volume.plus(
                userOptionData.totalFee
            );
            WeeklyLeaderboardEntity.totalTrades = WeeklyLeaderboardEntity.totalTrades + 1;
            WeeklyLeaderboardEntity.netPnL = WeeklyLeaderboardEntity.netPnL.plus(
                event.params.profit.minus(userOptionData.totalFee)
            );
            WeeklyLeaderboardEntity.tradesWon = WeeklyLeaderboardEntity.tradesWon + 1;
            WeeklyLeaderboardEntity.winRate = (WeeklyLeaderboardEntity.tradesWon * 100000) / WeeklyLeaderboardEntity.totalTrades;
            WeeklyLeaderboardEntity.save();
        }
    }
}

export function handleExpire(event: Expire): void {
    let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
    if ((routerContract.contractRegistry(event.address) == true) || (event.address == Address.fromString(ARBITRUM_SOLANA_ADDRESS))) {
        let referrenceID = `${event.params.id}${event.address}`;
        let userOptionData = UserOptionData.load(referrenceID);
        if (userOptionData != null) {
            userOptionData.state = State.expired;
            userOptionData.expirationPrice = event.params.priceAtExpiration;
            userOptionData.save();
            let timestamp = userOptionData.creationTime;
            let optionContractInstance = BufferBinaryOptions.bind(
                event.address
            );
            let optionContractData = _loadOrCreateOptionContractEntity(
                event.address
            );
            optionContractData.currentUtilization = calculateCurrentUtilization(
                optionContractInstance
            );
            optionContractData.save();
            if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
                updateOpenInterest(
                    timestamp,
                    false,
                    userOptionData.isAbove,
                    userOptionData.totalFee,
                    event.address
                );
                storePnl(
                    timestamp,
                    userOptionData.totalFee.minus(userOptionData.settlementFee),
                    false
                );
                storePnlPerContract(
                    timestamp,
                    userOptionData.totalFee.minus(userOptionData.settlementFee),
                    false,
                    event.address
                );

                // Leaderboard
                let leaderboardEntity = _loadOrCreateLeaderboardEntity(
                    _getDayId(timestamp),
                    userOptionData.user
                );
                leaderboardEntity.volume = leaderboardEntity.volume.plus(
                    userOptionData.totalFee
                );
                leaderboardEntity.totalTrades =
                    leaderboardEntity.totalTrades + 1;
                leaderboardEntity.netPnL = leaderboardEntity.netPnL.minus(
                    userOptionData.totalFee
                );
                leaderboardEntity.save();

                // Weekly Leaderboard
                let WeeklyLeaderboardEntity = _loadOrCreateWeeklyLeaderboardEntity(
                    _getWeekId(timestamp),
                    userOptionData.user
                );
                WeeklyLeaderboardEntity.volume = WeeklyLeaderboardEntity.volume.plus(
                    userOptionData.totalFee
                );
                WeeklyLeaderboardEntity.totalTrades = WeeklyLeaderboardEntity.totalTrades + 1;
                WeeklyLeaderboardEntity.netPnL = WeeklyLeaderboardEntity.netPnL.minus(
                    userOptionData.totalFee
                );
                WeeklyLeaderboardEntity.winRate = (WeeklyLeaderboardEntity.tradesWon * 100000) / WeeklyLeaderboardEntity.totalTrades;
                WeeklyLeaderboardEntity.save();
            }
        } else {
            throw console.error(
                "User option data not found for id {} and contract {}",
                [event.params.id.toString(), event.address.toHexString()]
            );
        }
    }
}

export function handleUpdateReferral(event: UpdateReferral): void {
    let routerContract = BufferRouter.bind(Address.fromString(RouterAddress));
    let optionContractInstance = BufferBinaryOptions.bind(
        event.address
    );
    if (routerContract.contractRegistry(event.address) == true) {
        if (optionContractInstance.tokenX() == Address.fromString(USDC_ADDRESS)) {
            let user = event.params.user;
            let referrer = event.params.referrer;

            let userReferralData = _loadOrCreateReferralData(user);
            userReferralData.totalDiscountAvailed = userReferralData.totalDiscountAvailed.plus(
                event.params.rebate
            );
            userReferralData.totalTradingVolume = userReferralData.totalTradingVolume.plus(
                event.params.totalFee
            );
            userReferralData.save();

            let referrerReferralData = _loadOrCreateReferralData(referrer);
            referrerReferralData.totalTradesReferred += 1;
            referrerReferralData.totalVolumeOfReferredTrades = referrerReferralData.totalVolumeOfReferredTrades.plus(
                event.params.totalFee
            );
            referrerReferralData.totalRebateEarned = referrerReferralData.totalRebateEarned.plus(
                event.params.referrerFee
            );
            referrerReferralData.save();

            let dayID = _getDayId(event.block.timestamp);
            let userRewardEntity = _loadOrCreateUserRewards(
                dayID,
                event.block.timestamp
            );
            userRewardEntity.referralDiscount = userRewardEntity.referralDiscount.plus(event.params.rebate);
            userRewardEntity.referralReward = userRewardEntity.referralReward.plus(event.params.referrerFee);
            userRewardEntity.nftDiscount = userRewardEntity.cumulativeReward.minus(event.params.rebate);
            userRewardEntity.save()
        }
    }
}

export function handleProvide(event: Provide): void {
    let poolContractInstance = BinaryPool.bind(event.address);
    let rate = poolContractInstance
        .totalTokenXBalance()
        .times(BigInt.fromI64(100000000))
        .div(poolContractInstance.totalSupply());

    let poolStat = _loadOrCreatePoolStat(
        _getDayId(event.block.timestamp),
        "daily"
    );
    let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
    poolStat.amount =  usdcContractInstance.balanceOf(event.address);

    poolStat.timestamp = event.block.timestamp;
    poolStat.rate = rate;
    poolStat.save();

    let totalPoolStat = _loadOrCreatePoolStat("total", "total");
    totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);

    totalPoolStat.timestamp = event.block.timestamp;
    totalPoolStat.save();
}

export function handleWithdraw(event: Withdraw): void {
    let poolContractInstance = BinaryPool.bind(event.address);
    let rate = poolContractInstance
        .totalTokenXBalance()
        .times(BigInt.fromI64(100000000))
        .div(poolContractInstance.totalSupply());

    let poolStat = _loadOrCreatePoolStat(
        _getDayId(event.block.timestamp),
        "daily"
    );
    let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
    poolStat.amount =  usdcContractInstance.balanceOf(event.address);
    poolStat.timestamp = event.block.timestamp;
    poolStat.rate = rate;
    poolStat.save();

    let totalPoolStat = _loadOrCreatePoolStat("total", "total");
    totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);

    totalPoolStat.timestamp = event.block.timestamp;
    totalPoolStat.save();
}


export function handleProfit(event: Profit): void {
    let poolContractInstance = BinaryPool.bind(event.address);
    let rate = poolContractInstance
        .totalTokenXBalance()
        .times(BigInt.fromI64(100000000))
        .div(poolContractInstance.totalSupply());   
    let poolStat = _loadOrCreatePoolStat(
        _getDayId(event.block.timestamp),
        "daily"
    );
    let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
    poolStat.amount =  usdcContractInstance.balanceOf(event.address);

    poolStat.timestamp = event.block.timestamp;
    poolStat.rate = rate;
    poolStat.save();

    let totalPoolStat = _loadOrCreatePoolStat("total", "total");
    totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);

    totalPoolStat.timestamp = event.block.timestamp;
    totalPoolStat.save();
}

export function handleLoss(event: Loss): void {
    let poolContractInstance = BinaryPool.bind(event.address);
    let rate = poolContractInstance
        .totalTokenXBalance()
        .times(BigInt.fromI64(100000000))
        .div(poolContractInstance.totalSupply());
    let poolStat = _loadOrCreatePoolStat(
        _getDayId(event.block.timestamp),
        "daily"
    );
    let usdcContractInstance = USDC.bind(Address.fromString(USDC_ADDRESS));
    poolStat.amount =  usdcContractInstance.balanceOf(event.address);
    poolStat.timestamp = event.block.timestamp;
    poolStat.rate = rate;
    poolStat.save();

    let totalPoolStat = _loadOrCreatePoolStat("total", "total");
    totalPoolStat.amount = usdcContractInstance.balanceOf(event.address);
    totalPoolStat.timestamp = event.block.timestamp;
    totalPoolStat.save();
}

export function handlePause(event: Pause): void {
    let isPaused = event.params.isPaused;
    let optionContract = _loadOrCreateOptionContractEntity(event.address);
    optionContract.isPaused = isPaused;
    optionContract.save()
}
