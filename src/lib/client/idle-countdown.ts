type IdleCountdownOptions = {
	seconds: number;
	onTick?: (remainingSeconds: number) => void;
	onExpired: () => void;
};

export function createIdleCountdown(options: IdleCountdownOptions) {
	const totalSeconds = options.seconds;
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
