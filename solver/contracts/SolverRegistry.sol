// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * SolverRegistry — On-chain intent logging for EZ-Path Solver
 * Records which intents were submitted, which route was selected, execution status
 */

contract SolverRegistry {
  struct Intent {
    bytes32 id;
    address submitter;
    address solver;
    string source;            // "ez-path" | "treasury-lp" | "direct-dex"
    uint256 sellAmount;
    address sellToken;
    address buyToken;
    uint256 executedAt;
    bool executed;
    string status;            // "success" | "failed" | "pending"
    string txHash;
    uint256 amountOut;
  }

  // Storage
  mapping(bytes32 => Intent) public intents;
  bytes32[] public intentIds;

  uint256 public totalIntents;
  uint256 public totalExecuted;

  // Route distribution
  uint256 public routeEZPath;
  uint256 public routeTreasuryLP;
  uint256 public routeDirectDEX;

  // Events
  event IntentSubmitted(bytes32 indexed id, address indexed submitter, address sellToken, address buyToken, uint256 sellAmount);
  event IntentExecuted(bytes32 indexed id, string source, string status, uint256 amountOut);

  // Access control
  address public solverOwner;

  modifier onlySolver() {
    require(msg.sender == solverOwner, "Only solver can call");
    _;
  }

  constructor() {
    solverOwner = msg.sender;
  }

  /**
   * Record intent submission
   */
  function recordIntent(
    bytes32 intentId,
    address submitter,
    address sellToken,
    address buyToken,
    uint256 sellAmount
  ) external onlySolver {
    require(intents[intentId].id == bytes32(0), "Intent already exists");

    intents[intentId] = Intent({
      id: intentId,
      submitter: submitter,
      solver: msg.sender,
      source: "",
      sellAmount: sellAmount,
      sellToken: sellToken,
      buyToken: buyToken,
      executedAt: 0,
      executed: false,
      status: "pending",
      txHash: "",
      amountOut: 0
    });

    intentIds.push(intentId);
    totalIntents++;

    emit IntentSubmitted(intentId, submitter, sellToken, buyToken, sellAmount);
  }

  /**
   * Record intent execution
   */
  function recordExecution(
    bytes32 intentId,
    string calldata source,
    string calldata status,
    string calldata txHash,
    uint256 amountOut
  ) external onlySolver {
    require(intents[intentId].id != bytes32(0), "Intent not found");
    require(!intents[intentId].executed, "Intent already executed");

    Intent storage intent = intents[intentId];
    intent.source = source;
    intent.executed = true;
    intent.status = status;
    intent.txHash = txHash;
    intent.amountOut = amountOut;
    intent.executedAt = block.timestamp;

    // Update distribution
    if (keccak256(abi.encodePacked(source)) == keccak256(abi.encodePacked("ez-path"))) {
      routeEZPath++;
    } else if (keccak256(abi.encodePacked(source)) == keccak256(abi.encodePacked("treasury-lp"))) {
      routeTreasuryLP++;
    } else if (keccak256(abi.encodePacked(source)) == keccak256(abi.encodePacked("direct-dex"))) {
      routeDirectDEX++;
    }

    if (keccak256(abi.encodePacked(status)) == keccak256(abi.encodePacked("success"))) {
      totalExecuted++;
    }

    emit IntentExecuted(intentId, source, status, amountOut);
  }

  /**
   * Get intent by ID
   */
  function getIntent(bytes32 intentId) external view returns (Intent memory) {
    return intents[intentId];
  }

  /**
   * Get all intent IDs (paginated)
   */
  function getIntentIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory) {
    require(offset < intentIds.length, "Offset out of bounds");

    uint256 remaining = intentIds.length - offset;
    uint256 count = remaining < limit ? remaining : limit;

    bytes32[] memory result = new bytes32[](count);
    for (uint256 i = 0; i < count; i++) {
      result[i] = intentIds[offset + i];
    }
    return result;
  }

  /**
   * Get metrics
   */
  function getMetrics() external view returns (
    uint256 total,
    uint256 executed,
    uint256 ezPathCount,
    uint256 treasuryLpCount,
    uint256 directDexCount
  ) {
    return (totalIntents, totalExecuted, routeEZPath, routeTreasuryLP, routeDirectDEX);
  }
}
