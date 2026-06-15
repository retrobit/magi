import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DebugPanel, { freshDebugScenario, isDebugScenarioActive } from './DebugPanel.svelte';
import type { NodeAssignment } from '$lib/magi/config';

const assignments: NodeAssignment[] = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

function setup(scenario = freshDebugScenario()) {
	const onchange = vi.fn();
	const onclose = vi.fn();
	const onopencatalog = vi.fn();
	render(DebugPanel, { props: { scenario, assignments, onchange, onclose, onopencatalog } });
	return { onchange, onclose, onopencatalog };
}

describe('freshDebugScenario / isDebugScenarioActive', () => {
	it('a fresh scenario injects nothing', () => {
		expect(isDebugScenarioActive(freshDebugScenario())).toBe(false);
	});

	it('a node error makes the scenario active', () => {
		const s = freshDebugScenario();
		s.nodeError.MAGI_1 = true;
		expect(isDebugScenarioActive(s)).toBe(true);
	});

	it('a non-off context level makes the scenario active', () => {
		const s = freshDebugScenario();
		s.nodeContext.MAGI_3 = 'warn';
		expect(isDebugScenarioActive(s)).toBe(true);
	});

	it('the global-error and partial-consensus flags each make it active', () => {
		const withError = { ...freshDebugScenario(), globalError: true };
		const withPartial = { ...freshDebugScenario(), partialConsensus: true };
		expect(isDebugScenarioActive(withError)).toBe(true);
		expect(isDebugScenarioActive(withPartial)).toBe(true);
	});

	it('a node Loading flag makes the scenario active', () => {
		const s = freshDebugScenario();
		s.nodeLoading.MAGI_1 = true;
		expect(isDebugScenarioActive(s)).toBe(true);
	});

	it('the consensus Loading flag makes the scenario active', () => {
		const s = freshDebugScenario();
		s.consensusLoading = true;
		expect(isDebugScenarioActive(s)).toBe(true);
	});
});

describe('DebugPanel', () => {
	it('renders an Error button and a context select for every node', () => {
		setup();
		expect(screen.getAllByRole('button', { name: 'Error' })).toHaveLength(3);
		// 3 node selects + 1 consensus select
		expect(screen.getAllByRole('combobox')).toHaveLength(4);
	});

	it('emits a scenario with the node error set when an Error button is clicked', async () => {
		const { onchange } = setup();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Error' })[0]);
		expect(onchange).toHaveBeenCalledOnce();
		expect(onchange.mock.calls[0][0].nodeError.MAGI_1).toBe(true);
	});

	it('disables a node context select while that node has an injected error', () => {
		const s = freshDebugScenario();
		s.nodeError.MAGI_1 = true;
		setup(s);
		const selects = screen.getAllByRole('combobox');
		expect(selects[0]).toBeDisabled();
		expect(selects[1]).not.toBeDisabled();
	});

	it('emits the chosen context level when a select changes', async () => {
		const { onchange } = setup();
		await fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'critical' } });
		expect(onchange.mock.calls[0][0].nodeContext.MAGI_1).toBe('critical');
	});

	it('toggles the global-error flag', async () => {
		const { onchange } = setup();
		await fireEvent.click(screen.getAllByRole('button', { name: 'OFF' })[0]);
		expect(onchange.mock.calls[0][0].globalError).toBe(true);
	});

	it('clears every injected state when Reset all is clicked', async () => {
		const dirty = freshDebugScenario();
		dirty.globalError = true;
		dirty.nodeContext.MAGI_3 = 'critical';
		const { onchange } = setup(dirty);
		await fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
		expect(isDebugScenarioActive(onchange.mock.calls[0][0])).toBe(false);
	});

	it('calls onclose when the close button is clicked', async () => {
		const { onclose } = setup();
		await fireEvent.click(screen.getByRole('button', { name: 'Close debug panel' }));
		expect(onclose).toHaveBeenCalledOnce();
	});
});

describe('DebugPanel — Load toggles', () => {
	it('renders one Load button per node plus one for the consensus', () => {
		setup();
		expect(screen.getAllByRole('button', { name: 'Load' })).toHaveLength(4);
	});

	it('node Load and Error are mutually exclusive', async () => {
		const { onchange } = setup();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Error' })[0]);
		expect(onchange.mock.calls[0][0].nodeError.MAGI_1).toBe(true);
		expect(onchange.mock.calls[0][0].nodeLoading.MAGI_1).toBe(false);

		// Re-render with the post-Error state so clicking Load flips from a true error.
		onchange.mockClear();
		const s = freshDebugScenario();
		s.nodeError.MAGI_1 = true;
		setup(s);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0]);
		expect(onchange.mock.calls[0][0].nodeLoading.MAGI_1).toBe(true);
		expect(onchange.mock.calls[0][0].nodeError.MAGI_1).toBe(false);
	});

	it('node Context select is disabled when nodeLoading is on', () => {
		const s = freshDebugScenario();
		s.nodeLoading.MAGI_1 = true;
		setup(s);
		const selects = screen.getAllByRole('combobox');
		expect(selects[0]).toBeDisabled();
		expect(selects[1]).not.toBeDisabled();
	});

	it('consensus Context select is disabled when consensusLoading is on', () => {
		const s = freshDebugScenario();
		s.consensusLoading = true;
		setup(s);
		const selects = screen.getAllByRole('combobox');
		// 3 node selects + 1 consensus select; consensus is the last one.
		expect(selects[3]).toBeDisabled();
	});
});
