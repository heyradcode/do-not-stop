/**
 * Parses smart contract errors and returns user-friendly messages
 */

export interface ParsedError {
  message: string;
  isUserRejection: boolean;
  isContractError: boolean;
}

export function parseContractError(error: any): ParsedError {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';

  // User rejection errors
  if (errorMessage.includes('User rejected') ||
    errorMessage.includes('User denied') ||
    errorMessage.includes('rejected') ||
    errorMessage.includes('User rejected the request')) {
    return {
      message: 'Transaction cancelled by user',
      isUserRejection: true,
      isContractError: false
    };
  }

  // Smart contract revert errors
  if (errorMessage.includes('execution reverted') ||
    errorMessage.includes('revert') ||
    errorMessage.includes('VM Exception') ||
    errorMessage.includes('reverted with the following reason')) {

    // Extract the revert reason from the error message
    let revertReason = extractRevertReason(errorMessage);

    // Map common revert reasons to user-friendly messages
    const friendlyMessage = mapRevertReasonToFriendlyMessage(revertReason, error);

    return {
      message: friendlyMessage,
      isUserRejection: false,
      isContractError: true
    };
  }

  // Network errors
  if (errorMessage.includes('network') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('timeout')) {
    return {
      message: 'Network error. Please check your connection and try again.',
      isUserRejection: false,
      isContractError: false
    };
  }

  // Gas errors
  if (errorMessage.includes('out of gas') ||
    errorMessage.includes('gas required exceeds allowance') ||
    errorMessage.includes('transaction ran out of gas') ||
    errorMessage.includes('insufficient funds')) {
    return {
      message: '⛽ Transaction ran out of gas. Please try again with more gas.',
      isUserRejection: false,
      isContractError: false
    };
  }

  // Generic error
  return {
    message: 'Transaction failed. Please try again.',
    isUserRejection: false,
    isContractError: false
  };
}

function extractRevertReason(errorMessage: string): string {
  // Try to extract revert reason from various error formats

  // Format: "The contract function "createRandomZombie" reverted with the following reason: Internal JSON-RPC error."
  const viemRevertMatch = errorMessage.match(/reverted with the following reason:\s*(.+?)(?:\s*Contract Call:|$)/i);
  if (viemRevertMatch) {
    return viemRevertMatch[1].trim();
  }

  // Format: "execution reverted: You already have a zombie!"
  const revertMatch = errorMessage.match(/execution reverted:?\s*(.+)/i);
  if (revertMatch) {
    return revertMatch[1].trim();
  }

  // Format: "revert You already have a zombie!"
  const revertMatch2 = errorMessage.match(/revert\s+(.+)/i);
  if (revertMatch2) {
    return revertMatch2[1].trim();
  }

  // Format: "VM Exception while processing transaction: revert You already have a zombie!"
  const vmExceptionMatch = errorMessage.match(/VM Exception.*?revert\s+(.+)/i);
  if (vmExceptionMatch) {
    return vmExceptionMatch[1].trim();
  }

  return errorMessage;
}

function mapRevertReasonToFriendlyMessage(revertReason: string, originalError?: any): string {
  const reason = revertReason.toLowerCase();

  // Handle gas errors first
  if (reason.includes('out of gas') ||
    reason.includes('gas required exceeds allowance') ||
    reason.includes('transaction ran out of gas')) {
    return '⛽ Transaction ran out of gas. Please try again with more gas.';
  }

  // Handle the most common contract revert reasons
  if (reason.includes('you already have a zombie')) {
    return '🧟‍♂️ You already have a zombie! Create a new one by breeding or battling.';
  }

  if (reason.includes('insufficient funds')) {
    return '💰 Insufficient funds for this transaction.';
  }

  if (reason.includes('unauthorized') || reason.includes('not the owner')) {
    return '🔒 You are not authorized to perform this action.';
  }

  // For generic RPC errors, provide a helpful message
  if (reason.includes('internal json-rpc error') ||
    reason.includes('execution reverted') ||
    reason.includes('transaction reverted')) {
    return '⚠️ Transaction failed. This might be due to contract rules or insufficient gas.';
  }

  // Return the original revert reason if no mapping found
  return revertReason;
}
