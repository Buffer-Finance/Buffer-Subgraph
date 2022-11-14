// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../Interfaces/InterfacesBinary.sol";

/**
 * @author Heisenberg
 * @notice Buffer Options Router Contract
 */
contract OptionRouter is AccessControl, IOptionRouter {
    bytes32 public constant BOT_ROLE = keccak256("BOT_ROLE");
    uint256 MAX_WAIT_TIME = 1 minutes;
    uint256 public nextQueueId = 0;
    address public publisher;
    uint256 public nextQueueIdToProcess = 0;
    bool public isInPrivateKeeperMode = true;
    IKeeperPayment public keeper;

    mapping(address => uint256[]) public userQueuedIds;
    mapping(address => uint256[]) public userCancelledQueuedIds;
    mapping(address => uint256) public userNextQueueIndexToProcess;
    mapping(uint256 => QueuedTrade) public queuedTrades;
    mapping(address => bool) public contractRegistry;
    mapping(address => bool) public isKeeper;

    constructor(address _publisher, IKeeperPayment _keeper) {
        publisher = _publisher;
        keeper = _keeper;
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

    function initiateTrade(
        uint256 totalFee,
        uint256 period,
        bool isAbove,
        address targetContract,
        uint256 expectedStrike,
        uint256 slippage,
        bool allowPartialFill,
        string memory referralCode
    ) external returns (uint256 queueId) {
        _validateContract(targetContract);
        IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
            targetContract
        );
        optionsContract.runInitialChecks(slippage, period, totalFee);

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
            0,
            true,
            referralCode
        );

        queuedTrades[queueId] = queuedTrade;

        userQueuedIds[msg.sender].push(queueId);

        emit InitiateTrade(queueId, msg.sender, block.timestamp);
    }

    function cancelQueuedTrade(uint256 queueId) external {
        QueuedTrade memory queuedTrade = queuedTrades[queueId];
        require(msg.sender == queuedTrade.user, "Router: Forbidden");
        require(queuedTrade.isQueued, "Router: Trade has already been opened");
        _cancelQueuedTrade(queueId);
        emit CancelTrade(queueId, queuedTrade.user, "User Cancelled");
    }

    /************************************************
     *  KEEPER ONLY FUNCTIONS
     ***********************************************/

    /**
     * @notice Resolves all queued trades
     */
    function resolveQueuedTrades(OpenTradeParams[] calldata params) external {
        _validateKeeper();
        for (uint256 index = 0; index < params.length; index++) {
            OpenTradeParams memory currentParams = params[index];
            QueuedTrade memory queuedTrade = queuedTrades[
                currentParams.queueId
            ];
            bool isSignerVerifed = _validateSigner(
                currentParams.timestamp,
                currentParams.asset,
                currentParams.price,
                currentParams.signature
            );
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
                // "Router: Trade has already been opened or cancelled" so ignore this trade or the price is wrong
                continue;
            }

            if (block.timestamp - queuedTrade.queuedTime <= MAX_WAIT_TIME) {
                _openQueuedTrade(currentParams.queueId, currentParams.price);
            } else {
                _cancelQueuedTrade(currentParams.queueId);
                emit CancelTrade(
                    currentParams.queueId,
                    queuedTrade.user,
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
     * @notice Unlocks an array of options
     */
    function unlockOptions(CloseTradeParams[] calldata optionData) external {
        _validateKeeper();

        uint256 arrayLength = optionData.length;
        for (uint256 i = 0; i < arrayLength; i++) {
            CloseTradeParams memory params = optionData[i];
            IBufferOptionsRead optionsContract = IBufferOptionsRead(
                params.asset
            );
            (, , uint256 amount, , , uint256 expiration, , , ) = optionsContract
                .options(params.optionId);

            bool isSignerVerifed = _validateSigner(
                params.expiryTimestamp,
                params.asset,
                params.priceAtExpiry,
                params.signature
            );

            if (expiration != params.expiryTimestamp) {
                emit FailUnlock(params.optionId, "Router: Wrong price");
                continue;
            }

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
            keeper.distributeForClose(params.optionId, amount, msg.sender);
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
    function _validateContract(address targetContract) private view {
        require(
            contractRegistry[targetContract],
            "Router: Unauthorized contract"
        );
    }

    function _validateKeeper() private view {
        require(
            !isInPrivateKeeperMode || isKeeper[msg.sender],
            "Keeper: forbidden"
        );
    }

    function _validateSigner(
        uint256 timestamp,
        address asset,
        uint256 price,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 digest = ECDSA.toEthSignedMessageHash(
            keccak256(abi.encodePacked(timestamp, asset, price))
        );
        address recoveredSigner = ECDSA.recover(digest, signature);
        return recoveredSigner == publisher;
    }

    function _openQueuedTrade(uint256 queueId, uint256 price) internal {
        QueuedTrade storage queuedTrade = queuedTrades[queueId];
        IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
            queuedTrade.targetContract
        );

        bool isSlippageWithinRange = optionsContract.isStrikeValid(
            queuedTrade.slippage,
            price,
            queuedTrade.expectedStrike
        );

        if (!isSlippageWithinRange) {
            _cancelQueuedTrade(queueId);
            emit CancelTrade(
                queueId,
                queuedTrade.user,
                "Slippage limit exceeds"
            );

            return;
        }
        uint256 amount;
        uint256 revisedFee;
        try
            optionsContract.checkParams(
                queuedTrade.totalFee,
                queuedTrade.allowPartialFill,
                queuedTrade.referralCode,
                queuedTrade.user,
                queuedTrade.period,
                queuedTrade.isAbove
            )
        returns (uint256 _amount, uint256 _revisedFee) {
            (amount, revisedFee) = (_amount, _revisedFee);
        } catch Error(string memory reason) {
            // Cancel the trade
            _cancelQueuedTrade(queueId);
            emit CancelTrade(queueId, queuedTrade.user, reason);
            return;
        }
        IERC20 tokenX = IERC20(optionsContract.tokenX());
        tokenX.transfer(queuedTrade.targetContract, revisedFee);
        if (revisedFee < queuedTrade.totalFee) {
            tokenX.transfer(
                queuedTrade.user,
                queuedTrade.totalFee - revisedFee
            );
        }

        try
            optionsContract.createFromRouter(
                queuedTrade.user,
                revisedFee,
                queuedTrade.period,
                queuedTrade.isAbove,
                price,
                amount,
                queuedTrade.referralCode
            )
        {} catch Error(string memory reason) {
            // Cancel the trade
            _cancelQueuedTrade(queueId);
            emit CancelTrade(queueId, queuedTrade.user, reason);
            return;
        }
        queuedTrade.isQueued = false;
        keeper.distributeForOpen(queueId, amount, msg.sender);
        emit OpenTrade(queueId, queuedTrade.user);
    }

    function _cancelQueuedTrade(uint256 queueId) internal {
        QueuedTrade storage queuedTrade = queuedTrades[queueId];
        IBufferBinaryOptions optionsContract = IBufferBinaryOptions(
            queuedTrade.targetContract
        );
        queuedTrade.isQueued = false;
        queuedTrade.cancellationTime = block.timestamp;
        IERC20(optionsContract.tokenX()).transfer(
            queuedTrade.user,
            queuedTrade.totalFee
        );

        userCancelledQueuedIds[queuedTrade.user].push(queueId);
    }
}
