<script lang="ts">
	import { Activity, X } from 'lucide-svelte';

	// Live client-side perf HUD — dev-only (the caller mounts it behind
	// `import.meta.env.DEV`). It surfaces the three signals that answer "is the
	// app burning CPU right now":
	//   • FPS         — frame cadence via requestAnimationFrame.
	//   • Long tasks  — main-thread blocks >50ms (PerformanceObserver 'longtask'),
	//                   summed over a rolling window. This is jank from JS work
	//                   (markdown rendering, Svelte effects), not the compositor.
	//   • CPU         — the Compute Pressure API ('nominal'→'critical') where the
	//                   browser supports it. Uniquely, this reflects GPU/compositor
	//                   cost (e.g. an animated background blur), which FPS and long
	//                   tasks can both miss because that work runs off-thread.
	// The blind spot this overlay closes is exactly the one that let an always-on
	// triple blur ship as the default background.

	// Window over which long tasks are summed before they decay out of the readout.
	const WINDOW_MS = 2000;

	let fps = $state(0);
	let longTaskCount = $state(0);
	let longTaskMs = $state(0);
	let cpuPressure = $state<string | null>(null);
	let gpuPressure = $state<string | null>(null);
	// Start collapsed — the HUD is opt-in, so it doesn't cover content on load.
	let collapsed = $state(true);

	function fpsColor(v: number): string {
		if (v >= 55) return 'text-emerald-400';
		if (v >= 30) return 'text-amber-400';
		return 'text-red-400';
	}

	function pressureColor(state: string | null): string {
		switch (state) {
			case 'nominal':
				return 'text-emerald-400';
			case 'fair':
				return 'text-amber-400';
			case 'serious':
				return 'text-orange-400';
			case 'critical':
				return 'text-red-400';
			default:
				return 'text-gray-500';
		}
	}

	$effect(() => {
		// Count frames over a sub-second window and extrapolate to a per-second rate.
		let frames = 0;
		let windowStart = performance.now();
		let rafId = requestAnimationFrame(function tick(now: number) {
			frames += 1;
			const elapsed = now - windowStart;
			if (elapsed >= 500) {
				fps = Math.round((frames * 1000) / elapsed);
				frames = 0;
				windowStart = now;
			}
			rafId = requestAnimationFrame(tick);
		});
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		// Retain long-task entries seen in the last WINDOW_MS; expose count + total.
		if (typeof PerformanceObserver === 'undefined') return;
		let entries: { ts: number; dur: number }[] = [];
		const recompute = () => {
			const cutoff = performance.now() - WINDOW_MS;
			entries = entries.filter((e) => e.ts >= cutoff);
			longTaskCount = entries.length;
			longTaskMs = Math.round(entries.reduce((sum, e) => sum + e.dur, 0));
		};
		let observer: PerformanceObserver;
		try {
			observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					entries.push({ ts: entry.startTime, dur: entry.duration });
				}
				recompute();
			});
			observer.observe({ entryTypes: ['longtask'] });
		} catch {
			// 'longtask' unsupported (e.g. Safari) — leave the counters at zero.
			return;
		}
		// Decay the window even while no new long tasks arrive, so a quiet stretch
		// drops the readout back to 0 instead of freezing on the last burst.
		const decay = setInterval(recompute, WINDOW_MS / 2);
		return () => {
			observer.disconnect();
			clearInterval(decay);
		};
	});

	// The Compute Pressure API has no DOM lib types yet — describe the slice we use.
	interface PressureRecord {
		source: string;
		state: string;
	}
	interface PressureObserverLike {
		observe(source: string, options?: { sampleInterval?: number }): Promise<void> | void;
		disconnect(): void;
	}
	type PressureObserverCtor = {
		new (callback: (records: PressureRecord[]) => void): PressureObserverLike;
		knownSources?: readonly string[];
	};

	$effect(() => {
		const Ctor = (globalThis as unknown as { PressureObserver?: PressureObserverCtor })
			.PressureObserver;
		if (!Ctor) return;
		// Only "cpu" ships today; "gpu" is a future source named in the spec. Observe
		// whichever the browser advertises so the GPU row lights up automatically if
		// it ever lands — until then it reads "n/a". knownSources is a hint, so an
		// observe() can still reject; swallow that per-source.
		const known = Ctor.knownSources ?? [];
		let observer: PressureObserverLike;
		try {
			observer = new Ctor((records) => {
				for (const r of records) {
					if (r.source === 'cpu') cpuPressure = r.state;
					else if (r.source === 'gpu') gpuPressure = r.state;
				}
			});
			for (const source of ['cpu', 'gpu'] as const) {
				if (known.includes(source)) {
					Promise.resolve(observer.observe(source, { sampleInterval: 1000 })).catch(() => {});
				}
			}
		} catch {
			// Constructor unsupported or blocked by permissions policy — show n/a.
			return;
		}
		return () => observer.disconnect();
	});
</script>

{#if collapsed}
	<button
		type="button"
		class="fixed bottom-3 left-3 z-50 rounded-md border border-gray-700 bg-gray-900/90 p-1.5 text-gray-400 shadow-lg backdrop-blur transition-colors hover:text-white"
		onclick={() => (collapsed = false)}
		aria-label="Show perf overlay"
		title="Perf overlay"
	>
		<Activity size={14} />
	</button>
{:else}
	<div
		class="fixed bottom-3 left-3 z-50 w-40 rounded-md border border-gray-700 bg-gray-900/90 p-2 font-mono text-[11px] leading-tight text-gray-300 shadow-lg backdrop-blur"
	>
		<div class="mb-1.5 flex items-center justify-between">
			<span class="flex items-center gap-1 text-gray-400">
				<Activity size={11} /> PERF
			</span>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-white"
				onclick={() => (collapsed = true)}
				aria-label="Collapse perf overlay"
			>
				<X size={11} />
			</button>
		</div>
		<div class="flex justify-between">
			<span>FPS</span>
			<span class={fpsColor(fps)}>{fps}</span>
		</div>
		<div class="flex justify-between">
			<span>Long tasks</span>
			<span class={longTaskMs > 0 ? 'text-amber-400' : 'text-gray-500'}>
				{longTaskCount} / {longTaskMs}ms
			</span>
		</div>
		<div class="flex justify-between">
			<span>CPU</span>
			<span class={pressureColor(cpuPressure)}>{cpuPressure ?? 'n/a'}</span>
		</div>
		<div class="flex justify-between">
			<span>GPU</span>
			<span class={pressureColor(gpuPressure)}>{gpuPressure ?? 'n/a'}</span>
		</div>
	</div>
{/if}
