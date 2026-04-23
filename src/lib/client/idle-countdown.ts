type IdleCountdownOptions = {
	seconds?: number;
	onTick?: (remainingSeconds: number) => void;
	onExpired: () => void;
};

export const IDLE_TIMEOUT_SECONDS = 60;

export function createIdleCountdown(options: IdleCountdownOptions) {
	const totalSeconds = Math.max(1, Math.floor(options.seconds ?? IDLE_TIMEOUT_SECONDS));
	let remainingSeconds = totalSeconds;
	let interval: ReturnType<typeof setInterval> | null = null;
	let expired = false;

	function emitTick() {
		options.onTick?.(remainingSeconds);
	}

	function stop() {
		if (!interval) return;
		clearInterval(interval);
		interval = null;
	}

	function expire() {
		if (expired) return;
		expired = true;
		stop();
		remainingSeconds = 0;
		emitTick();
		options.onExpired();
	}

	function start() {
		stop();
		expired = false;
		remainingSeconds = totalSeconds;
		emitTick();

		interval = setInterval(() => {
			remainingSeconds = Math.max(0, remainingSeconds - 1);
			emitTick();

			if (remainingSeconds === 0) {
				expire();
			}
		}, 1000);
	}

	function reset() {
		if (expired) return;
		remainingSeconds = totalSeconds;
		emitTick();
	}

	return {
		start,
		reset,
		stop,
		getTotalSeconds: () => totalSeconds,
		getRemainingSeconds: () => remainingSeconds
	};
}
