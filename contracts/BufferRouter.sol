// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../interfaces/Interfaces.sol";

/**
 * @author Heisenberg
 * @notice Buffer Options Router Contract
 */
contract BufferRouter is AccessControl, IBufferRouter {
    uint16 MAX_WAIT_TIME = 1 minutes;
    uint256 public nextQueueId = 0;
    address public publisher;
    uint256 public nextQueueIdToProcess = 0;
    bool public isInPrivateKeeperMode = true;

    mapping(address => uint256[]) public userQueuedIds;
    mapping(address => uint256[]) public userCancelledQueuedIds;
    mapping(address => uint256) public userNextQueueIndexToProcess;
    mapping(uint256 => QueuedTrade) public queuedTrades;
    mapping(address => bool) public contractRegistry;
    mapping(address => bool) public isKeeper;

    constructor(address _publisher) {
        publisher = _publisher;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /************************************************
     *  ADMIN ONLY FUNCTIONS
     ***********************************************/

    function setContractRegistry(address targetContract, bool register)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        contractRegistry[targetContract] = register;
    }

    function setKeeper(address _keeper, bool _isActive)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        isKeeper[_keeper] = _isActive;
    }

    function setInPrivateKeeperMode() external onlyRole(DEFAULT_ADMIN_ROLE) {
        isInPrivateKeeperMode = !isInPrivateKeeperMode;
    }

    /************************************************
     *  USER WRITE FUNCTIONS
     ***********************************************/

    /**
     * @notice Adds an option creation request in the queue
     */
    function initiateTrade(
        uint256 totalFee,
        uint256 period,
        bool isAbove,
        address targetContract,
        uint256 expectedStrike,
        uint256 slippage,
        bool allowPartialFill,
        string memory referralCode,
        uint256 traderNFTId
    ) external returns (uint256 queueId) {
        // Checks if the target contract has been registered
        require(
            contractRegistry[targetContract],
            "Router: Unauthorized contract"
        );
        IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
            targetContract
        );

        optionsContract.runInitialChecks(slippage, period, totalFee);

        // Transfer the fee specified from the user to this contract.
        // User has to approve first inorder to execute this function
        IERC20(optionsContract.tokenX()).transferFrom(
            msg.sender,
            address(this),
            totalFee
        );
        queueId = nextQueueId;
        nextQueueId++;

        QueuedTrade memory queuedTrade = QueuedTrade(
            queueId,
            userQueueCount(msg.sender),
            msg.sender,
            totalFee,
            period,
            isAbove,
            targetContract,
            expectedStrike,
            slippage,
            allowPartialFill,
            block.timestamp,
            true,
            referralCode,
            traderNFTId
        );

        queuedTrades[queueId] = queuedTrade;

        userQueuedIds[msg.sender].push(queueId);

        emit InitiateTrade(msg.sender, queueId, block.timestamp);
    }

    /**
     * @notice Cancels a queued traded. Can only be called by the trade owner
     */
    function cancelQueuedTrade(uint256 queueId) external {
        QueuedTrade memory queuedTrade = queuedTrades[queueId];
        require(msg.sender == queuedTrade.user, "Router: Forbidden");
        require(queuedTrade.isQueued, "Router: Trade has already been opened");
        _cancelQueuedTrade(queueId);
        emit CancelTrade(queuedTrade.user, queueId, "User Cancelled");
    }

    /************************************************
     *  KEEPER ONLY FUNCTIONS
     ***********************************************/

    /**
     * @notice Verifies the trade parameter via the signature and resolves all the valid queued trades
     */
    function resolveQueuedTrades(OpenTradeParams[] calldata params) external {
        _validateKeeper();
        for (uint32 index = 0; index < params.length; index++) {
            OpenTradeParams memory currentParams = params[index];
            QueuedTrade memory queuedTrade = queuedTrades[
                currentParams.queueId
            ];
            IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
                queuedTrade.targetContract
            );
            bool isSignerVerifed = _validateSigner(
                currentParams.timestamp,
                optionsContract.assetPair(),
                currentParams.price,
                currentParams.signature
            );
            // Silently fail if the signature doesn't match
            if (!isSignerVerifed) {
                emit FailResolve(
                    currentParams.queueId,
                    "Router: Signature didn't match"
                );
                continue;
            }
            if (
                !queuedTrade.isQueued ||
                currentParams.timestamp != queuedTrade.queuedTime
            ) {
                // Trade has already been opened or cancelled or the timestamp is wrong.
                // So ignore this trade.
                continue;
            }

            // If the opening time is much greater than the queue time then cancel the trade
            if (block.timestamp - queuedTrade.queuedTime <= MAX_WAIT_TIME) {
                _openQueuedTrade(currentParams.queueId, currentParams.price);
            } else {
                _cancelQueuedTrade(currentParams.queueId);
                emit CancelTrade(
                    queuedTrade.user,
                    currentParams.queueId,
                    "Wait time too high"
                );
            }

            // Track the next queueIndex to be processed for user
            userNextQueueIndexToProcess[queuedTrade.user] =
                queuedTrade.userQueueIndex +
                1;
        }
        // Track the next queueIndex to be processed overall
        nextQueueIdToProcess = params[params.length - 1].queueId + 1;
    }

    /**
     * @notice Verifies the option parameter via the signature and unlocks an array of options
     */
    function unlockOptions(CloseTradeParams[] calldata optionData) external {
        _validateKeeper();

        uint32 arrayLength = uint32(optionData.length);
        for (uint32 i = 0; i < arrayLength; i++) {
            CloseTradeParams memory params = optionData[i];
            IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
                params.targetContract
            );
            (, , , , , uint256 expiration, , , ) = optionsContract.options(
                params.optionId
            );

            bool isSignerVerifed = _validateSigner(
                params.expiryTimestamp,
                optionsContract.assetPair(),
                params.priceAtExpiry,
                params.signature
            );

            // Silently fail if the timestamp of the signature is wrong
            if (expiration != params.expiryTimestamp) {
                emit FailUnlock(params.optionId, "Router: Wrong price");
                continue;
            }

            // Silently fail if the signature doesn't match
            if (!isSignerVerifed) {
                emit FailUnlock(
                    params.optionId,
                    "Router: Signature didn't match"
                );
                continue;
            }

            try
                optionsContract.unlock(params.optionId, params.priceAtExpiry)
            {} catch Error(string memory reason) {
                emit FailUnlock(params.optionId, reason);
                continue;
            }
        }
    }

    /************************************************
     *  READ ONLY FUNCTIONS
     ***********************************************/

    function userQueueCount(address user) public view returns (uint256) {
        return userQueuedIds[user].length;
    }

    function userCancelledQueueCount(address user)
        external
        view
        returns (uint256)
    {
        return userCancelledQueuedIds[user].length;
    }

    /************************************************
     *  INTERNAL FUNCTIONS
     ***********************************************/
    function _validateKeeper() private view {
        require(
            !isInPrivateKeeperMode || isKeeper[msg.sender],
            "Keeper: forbidden"
        );
    }

    function _validateSigner(
        uint256 timestamp,
        string memory assetPair,
        uint256 price,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 digest = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encodePacked(assetPair, timestamp, price))
        );
        address recoveredSigner = ECDSA.recover(digest, signature);
        return recoveredSigner == publisher;
    }

    function _openQueuedTrade(uint256 queueId, uint256 price) internal {
        QueuedTrade storage queuedTrade = queuedTrades[queueId];
        IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
            queuedTrade.targetContract
        );

        // Check if slippage lies within the bounds
        bool isSlippageWithinRange = optionsContract.isStrikeValid(
            queuedTrade.slippage,
            price,
            queuedTrade.expectedStrike
        );

        if (!isSlippageWithinRange) {
            _cancelQueuedTrade(queueId);
            emit CancelTrade(
                queuedTrade.user,
                queueId,
                "Slippage limit exceeds"
            );

            return;
        }

        // Check all the parameters and compute the amount and revised fee
        uint256 amount;
        uint256 revisedFee;
        bool isReferralValid;
        IBufferBinaryOptions.OptionParams
            memory optionParams = IBufferBinaryOptions.OptionParams(
                queuedTrade.expectedStrike,
                0,
                queuedTrade.period,
                queuedTrade.isAbove,
                queuedTrade.allowPartialFill,
                queuedTrade.totalFee,
                queuedTrade.user,
                queuedTrade.referralCode,
                queuedTrade.traderNFTId
            );
        try optionsContract.checkParams(optionParams) returns (
            uint256 _amount,
            uint256 _revisedFee,
            bool _isReferralValid
        ) {
            (amount, revisedFee, isReferralValid) = (
                _amount,
                _revisedFee,
                _isReferralValid
            );
        } catch Error(string memory reason) {
            _cancelQueuedTrade(queueId);
            emit CancelTrade(queuedTrade.user, queueId, reason);
            return;
        }

        // Transfer the fee to the target options contract
        IERC20 tokenX = IERC20(optionsContract.tokenX());
        tokenX.transfer(queuedTrade.targetContract, revisedFee);

        // Refund the user in case the trade amount was lesser
        if (revisedFee < queuedTrade.totalFee) {
            tokenX.transfer(
                queuedTrade.user,
                queuedTrade.totalFee - revisedFee
            );
        }

        optionParams.totalFee = revisedFee;
        optionParams.strike = price;
        optionParams.amount = amount;

        uint256 optionId = optionsContract.createFromRouter(
            optionParams,
            isReferralValid
        );

        queuedTrade.isQueued = false;

        emit OpenTrade(queuedTrade.user, queueId, optionId);
    }

    function _cancelQueuedTrade(uint256 queueId) internal {
        QueuedTrade storage queuedTrade = queuedTrades[queueId];
        IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
            queuedTrade.targetContract
        );
        queuedTrade.isQueued = false;
        IERC20(optionsContract.tokenX()).transfer(
            queuedTrade.user,
            queuedTrade.totalFee
        );

        userCancelledQueuedIds[queuedTrade.user].push(queueId);
    }
}
