import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DebugPanel, { freshDebugScenario, isDebugScenarioActive } from './DebugPanel.svelte';
import type { NodeAssignment } from '$lib/magi/config';

const assignments: NodeAssignment[] = [
	{ node: 'MELCHIOR', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-x' },
	{ node: 'BALTHASAR', gateway: 'openai', provider: 'openai', modelId: 'gpt-x' },
	{ node: 'CASPAR', gateway: 'google', provider: 'google', modelId: 'gemini-x' }
];

function setup(scenario = freshDebugScenario()) {
	const onchange = vi.fn();
	const onclose = vi.fn();
	render(DebugPanel, { props: { scenario, assignments, onchange, onclose } });
	return { onchange, onclose };
}

describe('freshDebugScenario / isDebugScenarioActive', () => {
	it('a fresh scenario injects nothing', () => {
		expect(isDebugScenarioActive(freshDebugScenario())).toBe(false);
	});

	it('a node error makes the scenario active', () => {
		const s = freshDebugScenario();
		s.nodeError.MELCHIOR = true;
		expect(isDebugScenarioActive(s)).toBe(true);
	});

	it('a non-off context level makes the scenario active', () => {
		const s = freshDebugScenario();
		s.nodeContext.CASPAR = 'warn';
		expect(isDebugScenarioActive(s)).toBe(true);
	});

	it('the global-error and partial-consensus flags each make it active', () => {
		const withError = { ...freshDebugScenario(), globalError: true };
		const withPartial = { ...freshDebugScenario(), partialConsensus: true };
		expect(isDebugScenarioActive(withError)).toBe(true);
		expect(isDebugScenarioActive(withPartial)).toBe(true);
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
		expect(onchange.mock.calls[0][0].nodeError.MELCHIOR).toBe(true);
	});

	it('disables a node context select while that node has an injected error', () => {
		const s = freshDebugScenario();
		s.nodeError.MELCHIOR = true;
		setup(s);
		const selects = screen.getAllByRole('combobox');
		expect(selects[0]).toBeDisabled();
		expect(selects[1]).not.toBeDisabled();
	});

	it('emits the chosen context level when a select changes', async () => {
		const { onchange } = setup();
		await fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'critical' } });
		expect(onchange.mock.calls[0][0].nodeContext.MELCHIOR).toBe('critical');
	});

	it('toggles the global-error flag', async () => {
		const { onchange } = setup();
		await fireEvent.click(screen.getAllByRole('button', { name: 'OFF' })[0]);
		expect(onchange.mock.calls[0][0].globalError).toBe(true);
	});

	it('clears every injected state when Reset all is clicked', async () => {
		const dirty = freshDebugScenario();
		dirty.globalError = true;
		dirty.nodeContext.CASPAR = 'critical';
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
