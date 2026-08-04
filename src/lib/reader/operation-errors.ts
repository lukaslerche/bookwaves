export type ReaderOperation = 'secure' | 'unsecure' | 'edit' | 'clear';

export type ReaderOperationErrorReason =
	| 'wrong-password'
	| 'tag-locked'
	| 'tag-not-found'
	| 'tag-not-detected'
	| 'reader-unreachable'
	| 'authentication-failed'
	| 'unknown';

export type ReaderOperationError = {
	operation: ReaderOperation;
	reason: ReaderOperationErrorReason;
	rawMessage: string;
};

const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

function getRawMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error === null || typeof error === 'undefined') return UNKNOWN_ERROR_MESSAGE;
	return String(error);
}

export function classifyReaderOperationError(
	operation: ReaderOperation,
	error: unknown
): ReaderOperationError {
	const rawMessage = getRawMessage(error);
	const rawLower = rawMessage.toLowerCase();

	if (
		rawLower.includes('tag not found') ||
		rawLower.includes('item not found on reader') ||
		rawLower.includes('transponder not found')
	) {
		return { operation, reason: 'tag-not-found', rawMessage };
	}

	if (
		rawLower.includes('no transponder') ||
		rawLower.includes('no tags found') ||
		rawLower.includes('tag not detected') ||
		rawLower.includes('no tag detected')
	) {
		return { operation, reason: 'tag-not-detected', rawMessage };
	}

	if (
		rawLower.includes('failed to fetch') ||
		rawLower.includes('load failed') ||
		rawLower.includes('unreachable') ||
		rawLower.includes('not reachable') ||
		rawLower.includes('reader not found') ||
		rawLower.includes('connection refused') ||
		rawLower.includes('networkerror')
	) {
		return { operation, reason: 'reader-unreachable', rawMessage };
	}

	if (rawMessage.includes('ISO error: 3') || rawLower.includes('locked')) {
		return { operation, reason: 'tag-locked', rawMessage };
	}

	if (
		rawMessage.includes('ISO error: 4') ||
		rawLower.includes('wrong password') ||
		rawLower.includes('incorrect password') ||
		rawLower.includes('password mismatch') ||
		rawLower.includes('insufficient privileges')
	) {
		return { operation, reason: 'wrong-password', rawMessage };
	}

	if (
		rawLower.includes('unauthorized') ||
		rawLower.includes('forbidden') ||
		rawLower.includes('invalid token') ||
		rawLower.includes('api key') ||
		rawLower.includes('authentication failed')
	) {
		return { operation, reason: 'authentication-failed', rawMessage };
	}

	return { operation, reason: 'unknown', rawMessage };
}
