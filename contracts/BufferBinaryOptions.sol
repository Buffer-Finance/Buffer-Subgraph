// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.4;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/Interfaces.sol";

/**
 * @author Heisenberg
 * @title Buffer Options
 * @notice Creates ERC721 Options
 */

contract BufferBinaryOptions is
    IBufferBinaryOptions,
    ReentrancyGuard,
    ERC721,
    AccessControl
{
    uint256 public nextTokenId = 0;
    uint256 public totalLockedAmount;
    bool public isPaused;
    uint16 public baseSettlementFeePercentageForAbove; // Factor of 1e2
    uint16 public baseSettlementFeePercentageForBelow; // Factor of 1e2
    uint16 public stepSize = 250; // Factor of 1e2
    string public override assetPair;

    ILiquidityPool public override pool;
    IOptionsConfig public override config;
    IReferralStorage public referral;
    AssetCategory public assetCategory;
    ERC20 public override tokenX;

    mapping(uint256 => Option) public override options;
    mapping(address => uint256[]) public userOptionIds;
    mapping(uint8 => uint8) public nftTierStep;

    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    /************************************************
     *  INITIALIZATION FUNCTIONS
     ***********************************************/

    constructor(
        ERC20 _tokenX,
        ILiquidityPool _pool,
        IOptionsConfig _config,
        IReferralStorage _referral,
        AssetCategory _category,
        string memory _assetPair
    ) ERC721("Buffer", "BFR") {
        tokenX = _tokenX;
        pool = _pool;
        config = _config;
        referral = _referral;
        assetPair = _assetPair;
        assetCategory = _category;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Used to configure the contracts
     */
    function configure(
        uint16 _baseSettlementFeePercentageForAbove,
        uint16 _baseSettlementFeePercentageForBelow,
        uint8[4] calldata _nftTierStep
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(10e2 <= _baseSettlementFeePercentageForAbove, "O27");
        require(_baseSettlementFeePercentageForAbove <= 50e2, "O28");
        baseSettlementFeePercentageForAbove = _baseSettlementFeePercentageForAbove; // Percent with a factor of 1e2

        require(10e2 <= _baseSettlementFeePercentageForBelow, "O27");
        require(_baseSettlementFeePercentageForBelow <= 50e2, "O28");
        baseSettlementFeePercentageForBelow = _baseSettlementFeePercentageForBelow;

        for (uint8 i; i < 4; i++) {
            nftTierStep[i] = _nftTierStep[i];
        }
    }

    /**
     * @notice Grants complete approval from the pool
     */
    function approvePoolToTransferTokenX() public {
        tokenX.approve(address(pool), ~uint256(0));
    }

    /**
     * @notice Pauses/Unpauses the option creation
     */
    function toggleCreation() public onlyRole(DEFAULT_ADMIN_ROLE) {
        isPaused = !isPaused;
        emit Pause(isPaused);
    }

    /************************************************
     *  ROUTER ONLY FUNCTIONS
     ***********************************************/

    /**
     * @notice Creates an option with the specified parameters
     * @dev Can only be called by router
     */
    function createFromRouter(
        OptionParams calldata optionParams,
        bool isReferralValid
    ) external override onlyRole(ROUTER_ROLE) returns (uint256 optionID) {
        Option memory option = Option(
            State.Active,
            optionParams.strike,
            optionParams.amount,
            optionParams.amount,
            optionParams.amount / 2,
            block.timestamp + optionParams.period,
            optionParams.isAbove,
            optionParams.totalFee,
            block.timestamp
        );
        totalLockedAmount += optionParams.amount;
        optionID = _generateTokenId();
        userOptionIds[optionParams.user].push(optionID);
        options[optionID] = option;
        _mint(optionParams.user, optionID);

        uint256 referrerFee = _processReferralRebate(
            optionParams.user,
            optionParams.totalFee,
            optionParams.amount,
            optionParams.referralCode,
            optionParams.isAbove,
            isReferralValid
        );

        uint256 settlementFee = optionParams.totalFee -
            option.premium -
            referrerFee;

        tokenX.transfer(config.settlementFeeDisbursalContract(), settlementFee);
        pool.lock(optionID, option.lockedAmount, option.premium);
        emit Create(
            optionParams.user,
            optionID,
            settlementFee,
            optionParams.totalFee
        );
    }

    /**
     * @notice Unlocks/Exercises the active options
     * @dev Can only be called router
     */
    function unlock(uint256 optionID, uint256 priceAtExpiration)
        external
        override
        onlyRole(ROUTER_ROLE)
    {
        require(_exists(optionID), "O10");
        Option storage option = options[optionID];
        require(option.expiration <= block.timestamp, "O4");
        require(option.state == State.Active, "O5");

        if (
            (option.isAbove && priceAtExpiration > option.strike) ||
            (!option.isAbove && priceAtExpiration < option.strike)
        ) {
            _exercise(optionID, priceAtExpiration);
        } else {
            option.state = State.Expired;
            pool.unlock(optionID);
            _burn(optionID);
            emit Expire(optionID, option.premium, priceAtExpiration);
        }
        totalLockedAmount -= option.lockedAmount;
    }

    /************************************************
     *  READ ONLY FUNCTIONS
     ***********************************************/

    /**
     * @notice Returns decimals of the pool token
     */
    function decimals() public view returns (uint256) {
        return tokenX.decimals();
    }

    /**
     * @notice Calculates the fees for buying an option
     */
    function fees(
        uint256 amount,
        address user,
        bool isAbove,
        string calldata referralCode,
        uint256 traderNFTId
    )
        public
        view
        override
        returns (
            uint256 total,
            uint256 settlementFee,
            uint256 premium
        )
    {
        (uint256 settlementFeePercentage, ) = _getSettlementFeePercentage(
            referral.codeOwner(referralCode),
            user,
            _getbaseSettlementFeePercentage(isAbove),
            traderNFTId
        );
        (total, settlementFee, premium) = _fees(
            amount,
            settlementFeePercentage
        );
    }

    /**
     * @notice Checks if the strike price at which the trade is opened lies within the slippage bounds
     */
    function isStrikeValid(
        uint256 slippage,
        uint256 strike,
        uint256 expectedStrike
    ) external pure override returns (bool) {
        if (
            (strike <= (expectedStrike * (1e4 + slippage)) / 1e4) &&
            (strike >= (expectedStrike * (1e4 - slippage)) / 1e4)
        ) {
            return true;
        } else return false;
    }

    /**
     * @notice Checks if the market is open at the time of option creation and execution.
     * Used only for forex options
     */
    function isInCreationWindow(uint256 period) public view returns (bool) {
        uint256 currentTime = block.timestamp;
        uint256 currentDay = ((currentTime / 86400) + 4) % 7;
        uint256 expirationDay = (((currentTime + period) / 86400) + 4) % 7;

        if (currentDay == expirationDay) {
            uint256 currentHour = (currentTime / 3600) % 24;
            uint256 currentMinute = (currentTime % 3600) / 60;
            uint256 expirationHour = ((currentTime + period) / 3600) % 24;
            uint256 expirationMinute = ((currentTime + period) % 3600) / 60;
            (
                uint256 startHour,
                uint256 startMinute,
                uint256 endHour,
                uint256 endMinute
            ) = config.marketTimes(uint8(currentDay));

            if (
                (currentHour > startHour ||
                    (currentHour == startHour &&
                        currentMinute >= startMinute)) &&
                (currentHour < endHour ||
                    (currentHour == endHour && currentMinute < endMinute)) &&
                (expirationHour < endHour ||
                    (expirationHour == endHour && expirationMinute < endMinute))
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Runs the basic checks for option creation
     */
    function runInitialChecks(
        uint256 slippage,
        uint256 period,
        uint256 totalFee
    ) external view override {
        require(!isPaused, "O33");
        require(slippage <= 5e2, "O34"); // 5% is the max slippage a user can use
        require(period >= config.minPeriod(), "O21");
        require(period <= config.maxPeriod(), "O25");
        require(totalFee >= config.minFee(), "O35");
    }

    /**
     * @notice Calculates max option amount based on the pool's capacity
     */
    function getMaxUtilization()
        public
        view
        override
        returns (uint256 maxAmount)
    {
        // Calculate the max option size due to asset wise pool utilization limit
        uint256 totalPoolBalance = pool.totalTokenXBalance();
        uint256 availableBalance = totalPoolBalance - totalLockedAmount;
        uint256 utilizationLimit = config.assetUtilizationLimit();
        uint256 maxAssetWiseUtilizationAmount = _getMaxUtilization(
            totalPoolBalance,
            availableBalance,
            utilizationLimit
        );

        // Calculate the max option size due to overall pool utilization limit
        utilizationLimit = config.overallPoolUtilizationLimit();
        availableBalance = pool.availableBalance();
        uint256 maxUtilizationAmount = _getMaxUtilization(
            totalPoolBalance,
            availableBalance,
            utilizationLimit
        );

        // Take the min of the above 2 values
        maxAmount = min(maxUtilizationAmount, maxAssetWiseUtilizationAmount);
    }

    /**
     * @notice Runs all the checks on the option parameters and
     * returns the revised amount and fee
     */
    function checkParams(OptionParams calldata optionParams)
        external
        view
        override
        returns (
            uint256 amount,
            uint256 revisedFee,
            bool isReferralValid
        )
    {
        require(
            assetCategory != AssetCategory.Forex ||
                isInCreationWindow(optionParams.period),
            "O30"
        );

        uint256 maxAmount = getMaxUtilization();

        // Calculate the max fee due to the max txn limit
        uint256 maxPerTxnFee = ((pool.availableBalance() *
            config.optionFeePerTxnLimitPercent()) / 100e2);
        uint256 newFee = min(optionParams.totalFee, maxPerTxnFee);

        // Calculate the amount here from the new fees
        uint256 settlementFeePercentage;
        (
            settlementFeePercentage,
            isReferralValid
        ) = _getSettlementFeePercentage(
            referral.codeOwner(optionParams.referralCode),
            optionParams.user,
            _getbaseSettlementFeePercentage(optionParams.isAbove),
            optionParams.traderNFTId
        );
        (uint256 unitFee, , ) = _fees(10**decimals(), settlementFeePercentage);
        amount = (newFee * 10**decimals()) / unitFee;

        // Recalculate the amount and the fees if values are greater than the max and partial fill is allowed
        if (amount > maxAmount || newFee < optionParams.totalFee) {
            require(optionParams.allowPartialFill, "O29");
            amount = min(amount, maxAmount);
            (revisedFee, , ) = _fees(amount, settlementFeePercentage);
        } else {
            revisedFee = optionParams.totalFee;
        }
    }

    /************************************************
     * ERC721 FUNCTIONS
     ***********************************************/

    function _generateTokenId() internal returns (uint256) {
        return nextTokenId++;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /************************************************
     *  INTERNAL OPTION UTILITY FUNCTIONS
     ***********************************************/

    /**
     * @notice Returns the base settlement fee based on option type
     */
    function _getbaseSettlementFeePercentage(bool isAbove)
        internal
        view
        returns (uint16 baseSettlementFeePercentage)
    {
        baseSettlementFeePercentage = isAbove
            ? baseSettlementFeePercentageForAbove
            : baseSettlementFeePercentageForBelow;
    }

    /**
     * @notice Calculates the max utilization
     */
    function _getMaxUtilization(
        uint256 totalPoolBalance,
        uint256 availableBalance,
        uint256 utilizationLimit
    ) internal pure returns (uint256) {
        require(
            availableBalance >
                (((1e4 - utilizationLimit) * totalPoolBalance) / 1e4),
            "O31"
        );
        return
            availableBalance -
            (((1e4 - utilizationLimit) * totalPoolBalance) / 1e4);
    }

    /**
     * @notice Calculates the fees for buying an option
     */
    function _fees(uint256 amount, uint256 settlementFeePercentage)
        internal
        pure
        returns (
            uint256 total,
            uint256 settlementFee,
            uint256 premium
        )
    {
        // Probability for ATM options will always be 0.5 due to which we can skip using BSM
        premium = amount / 2;
        total = (premium * 1e4) / (1e4 - settlementFeePercentage);
        settlementFee = total - premium;
    }

    /**
     * @notice Exercises the ITM options
     */
    function _exercise(uint256 optionID, uint256 priceAtExpiration)
        internal
        returns (uint256 profit)
    {
        Option storage option = options[optionID];
        address user = ownerOf(optionID);
        profit = option.lockedAmount;
        pool.send(optionID, user, profit);

        // Burn the option
        _burn(optionID);
        option.state = State.Exercised;
        emit Exercise(user, optionID, profit, priceAtExpiration);
    }

    /**
     * @notice Sends the referral rebate to the referrer and
     * updates the stats in the referral storage contract
     */
    function _processReferralRebate(
        address user,
        uint256 totalFee,
        uint256 amount,
        string calldata referralCode,
        bool isAbove,
        bool isReferralValid
    ) internal returns (uint256 referrerFee) {
        address referrer = referral.codeOwner(referralCode);

        if (referrer != user && referrer != address(0)) {
            referrerFee = ((totalFee *
                referral.referrerTierDiscount(
                    referral.referrerTier(referrer)
                )) / (1e4 * 1e3));
            if (referrerFee > 0) {
                tokenX.transfer(referrer, referrerFee);

                (uint256 formerUnitFee, , ) = _fees(
                    10**decimals(),
                    _getbaseSettlementFeePercentage(isAbove)
                );
                emit UpdateReferral(
                    user,
                    referrer,
                    isReferralValid,
                    totalFee,
                    referrerFee,
                    ((formerUnitFee * amount) - totalFee),
                    referralCode
                );
            }
        }
    }

    /**
     * @notice Calculates the discount to be applied on settlement fee based on
     * NFT and referrer tiers
     */
    function _getSettlementFeeDiscount(
        address referrer,
        address user,
        uint256 traderNFTId
    ) public view returns (bool isReferralValid, uint8 maxStep) {
        if (config.traderNFTContract() != address(0)) {
            ITraderNFT nftContract = ITraderNFT(config.traderNFTContract());
            if (nftContract.tokenOwner(traderNFTId) == user)
                maxStep = nftTierStep[
                    nftContract.tokenTierMappings(traderNFTId)
                ];
        }
        if (referrer != user && referrer != address(0)) {
            uint8 step = referral.referrerTierStep(
                referral.referrerTier(referrer)
            );
            if (step > maxStep) {
                maxStep = step;
                isReferralValid = true;
            }
        }
    }

    /**
     * @notice Returns the discounted settlement fee
     */
    function _getSettlementFeePercentage(
        address referrer,
        address user,
        uint16 baseSettlementFeePercentage,
        uint256 traderNFTId
    )
        internal
        view
        returns (uint256 settlementFeePercentage, bool isReferralValid)
    {
        settlementFeePercentage = baseSettlementFeePercentage;
        uint256 maxStep;
        (isReferralValid, maxStep) = _getSettlementFeeDiscount(
            referrer,
            user,
            traderNFTId
        );
        settlementFeePercentage =
            settlementFeePercentage -
            (stepSize * maxStep);
    }
}
