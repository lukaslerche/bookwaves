import { m } from '$lib/paraglide/messages';
import type {
	ReaderOperation,
	ReaderOperationError,
	ReaderOperationErrorReason
} from './operation-errors';

const operationMessages: Record<ReaderOperation, () => string> = {
	secure: m.reader_secure_failed,
	unsecure: m.reader_unsecure_failed,
	edit: m.reader_edit_failed,
	clear: m.reader_clear_failed
};

const reasonMessages: Record<ReaderOperationErrorReason, () => string> = {
	'wrong-password': m.reader_error_wrong_password,
	'tag-locked': m.reader_error_tag_locked,
	'tag-not-found': m.reader_error_tag_not_found,
	'tag-not-detected': m.reader_error_tag_not_detected,
	'reader-unreachable': m.reader_error_reader_not_reachable,
	'authentication-failed': m.reader_error_authentication_failed,
	unknown: m.reader_error_unknown
};

export function getReaderOperationTitle(operation: ReaderOperation): string {
	return operationMessages[operation]();
}

export function formatReaderOperationError(error: ReaderOperationError): string {
	const title = getReaderOperationTitle(error.operation);
	const reason = reasonMessages[error.reason]();
	const displayReason =
		error.reason === 'unknown' && error.rawMessage ? `${reason}: ${error.rawMessage}` : reason;

	return `${title}: ${displayReason}`;
}
